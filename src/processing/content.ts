import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { Page } from 'playwright';
// Handle CJS/ESM interop for turndown
import TurndownModule from 'turndown';

import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TurndownService =
  (TurndownModule as unknown as { default?: typeof TurndownModule }).default ?? TurndownModule;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

export interface ExtractOptions {
  mode: 'text' | 'markdown' | 'structured';
  /** CSS selector to scope extraction to a specific element. */
  selector?: string;
  /** JSON Schema describing the desired shape (structured mode only). */
  schema?: JsonSchema;
  /** Maximum character length of the returned content (default 4000). */
  maxLength?: number;
}

export interface ExtractResult {
  content: string | Record<string, unknown> | Array<unknown>;
  url: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_LENGTH = 4000;

/** Tags whose content is never useful for extraction. */
const STRIP_TAGS = ['script', 'style', 'nav', 'footer', 'header', 'aside'];

/**
 * Heuristic map: schema property name -> CSS selectors likely to contain
 * the value for that property.
 */
const PROPERTY_HEURISTICS: Record<string, string[]> = {
  name: ['h1', 'h2', 'h3', 'a', '.name', '.title', '[data-name]'],
  title: ['h1', 'h2', 'h3', '.title', '.name', '[data-title]'],
  price: ['.price', '[data-price]', '.cost', '.amount'],
  description: ['p', '.description', '.summary', '.desc', '[data-description]'],
  url: ['a[href]'],
  link: ['a[href]'],
  href: ['a[href]'],
  image: ['img[src]'],
  img: ['img[src]'],
  src: ['img[src]'],
};

/** Properties whose value should be read from an attribute rather than text. */
const ATTR_PROPERTIES = new Set(['url', 'link', 'href', 'image', 'img', 'src']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove specified HTML tags **and their inner content** from an HTML string.
 */
function stripTags(html: string, tags: string[]): string {
  let result = html;
  for (const tag of tags) {
    // Non-greedy match across newlines
    const regex = new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'gi');
    result = result.replace(regex, '');
    // Also remove self-closing variants (rare for these tags, but safe)
    const selfClosing = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'gi');
    result = result.replace(selfClosing, '');
  }
  return result;
}

/**
 * Collapse excessive whitespace: 3+ consecutive newlines become 2, leading /
 * trailing whitespace on each line is trimmed, and the whole string is trimmed.
 */
function collapseWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Truncate a string to `maxLength` characters, appending an ellipsis marker
 * if truncation occurred.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

// ---------------------------------------------------------------------------
// Mode implementations
// ---------------------------------------------------------------------------

async function extractText(
  page: Page,
  selector: string | undefined,
  maxLength: number,
): Promise<{ content: string; title: string }> {
  const html = selector
    ? await page.$eval(selector, (el) => (el as HTMLElement).innerHTML).catch(() => null)
    : await page.content();

  if (!html) {
    return { content: '', title: await pageTitle(page) };
  }

  // Try Readability first — it excels at article-like pages.
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  let text: string;
  let title: string;

  if (article?.textContent) {
    text = article.textContent;
    title = article.title || (await pageTitle(page));
  } else {
    // Fallback: grab innerText from the page / scoped element.
    try {
      text = selector
        ? await page.$eval(selector, (el) => (el as HTMLElement).innerText)
        : await page.innerText('body');
    } catch {
      text = '';
    }
    title = await pageTitle(page);
  }

  text = collapseWhitespace(text);
  text = truncate(text, maxLength);

  return { content: text, title };
}

async function extractMarkdown(
  page: Page,
  selector: string | undefined,
  maxLength: number,
): Promise<{ content: string; title: string }> {
  let html: string;

  if (selector) {
    html = await page.$eval(selector, (el) => (el as HTMLElement).innerHTML).catch(() => '');
  } else {
    html = await page.$eval('body', (el) => (el as HTMLElement).innerHTML).catch(() => '');
  }

  if (!html) {
    return { content: '', title: await pageTitle(page) };
  }

  // Strip noisy tags before conversion.
  html = stripTags(html, STRIP_TAGS);

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  let markdown = turndown.turndown(html);
  markdown = collapseWhitespace(markdown);
  markdown = truncate(markdown, maxLength);

  const title = await pageTitle(page);
  return { content: markdown, title };
}

async function extractStructured(
  page: Page,
  selector: string | undefined,
  schema: JsonSchema | undefined,
  maxLength: number,
): Promise<{ content: Record<string, unknown> | Array<unknown>; title: string }> {
  if (!schema) {
    throw new ValidationError('Structured extraction requires a schema in ExtractOptions.schema');
  }

  const title = await pageTitle(page);

  // Array schema: find repeated elements matching selector, extract props.
  if (schema.type === 'array') {
    if (!selector) {
      throw new ValidationError('Structured extraction with an array schema requires a selector');
    }

    const itemSchema = schema.items;
    if (!itemSchema?.properties) {
      throw new ValidationError('Array schema must define items with properties');
    }

    const properties = itemSchema.properties;
    const propertyNames = Object.keys(properties);

    const items = await page.$$eval(
      selector,
      (elements, args) => {
        const {
          propertyNames: props,
          properties: propDefs,
          heuristics,
          attrProps,
        } = args as {
          propertyNames: string[];
          properties: Record<string, { type: string }>;
          heuristics: Record<string, string[]>;
          attrProps: string[];
        };

        const attrSet = new Set(attrProps);

        function extractPropFromEl(
          el: Element,
          propName: string,
          propDef: { type: string },
        ): unknown {
          const selectors = heuristics[propName.toLowerCase()] ?? [];

          // Check for a child matching a heuristic selector
          for (const sel of selectors) {
            const child = el.querySelector(sel);
            if (!child) continue;

            if (attrSet.has(propName.toLowerCase())) {
              // For link/image properties, read the relevant attribute.
              const href = child.getAttribute('href');
              if (href) return href;
              const src = child.getAttribute('src');
              if (src) return src;
            }

            const raw = (child as HTMLElement).innerText?.trim() ?? child.textContent?.trim() ?? '';
            if (raw) return coerce(raw, propDef.type);
          }

          // Fallback: try a child whose class or tag name contains the prop name.
          const lcProp = propName.toLowerCase();
          const fallback =
            el.querySelector(`[class*="${lcProp}"]`) ??
            el.querySelector(`[data-${lcProp}]`) ??
            el.querySelector(lcProp);

          if (fallback) {
            if (attrSet.has(lcProp)) {
              return fallback.getAttribute('href') ?? fallback.getAttribute('src') ?? '';
            }
            const raw =
              (fallback as HTMLElement).innerText?.trim() ?? fallback.textContent?.trim() ?? '';
            return coerce(raw, propDef.type);
          }

          return null;
        }

        function coerce(value: string, type: string): unknown {
          switch (type) {
            case 'number':
            case 'integer': {
              const n = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
              return Number.isNaN(n) ? null : n;
            }
            case 'boolean':
              return (
                value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes'
              );
            default:
              return value;
          }
        }

        return elements.map((el) => {
          const obj: Record<string, unknown> = {};
          for (const prop of props) {
            obj[prop] = extractPropFromEl(el, prop, propDefs[prop]);
          }
          return obj;
        });
      },
      {
        propertyNames,
        properties,
        heuristics: PROPERTY_HEURISTICS,
        attrProps: [...ATTR_PROPERTIES],
      },
    );

    // Truncate the serialized form if necessary.
    const serialized = JSON.stringify(items);
    if (serialized.length > maxLength) {
      // Trim by removing trailing items until under the limit.
      const trimmed = trimArray(items, maxLength);
      return { content: trimmed, title };
    }

    return { content: items, title };
  }

  // Object schema: extract a single object from the scoped element (or body).
  if (schema.type === 'object' && schema.properties) {
    const scope = selector ?? 'body';
    const properties = schema.properties;
    const propertyNames = Object.keys(properties);

    const obj = await page.$eval(
      scope,
      (el, args) => {
        const {
          propertyNames: props,
          properties: propDefs,
          heuristics,
          attrProps,
        } = args as {
          propertyNames: string[];
          properties: Record<string, { type: string }>;
          heuristics: Record<string, string[]>;
          attrProps: string[];
        };

        const attrSet = new Set(attrProps);

        function coerce(value: string, type: string): unknown {
          switch (type) {
            case 'number':
            case 'integer': {
              const n = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
              return Number.isNaN(n) ? null : n;
            }
            case 'boolean':
              return (
                value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes'
              );
            default:
              return value;
          }
        }

        const result: Record<string, unknown> = {};

        for (const prop of props) {
          const selectors = heuristics[prop.toLowerCase()] ?? [];
          let found = false;

          for (const sel of selectors) {
            const child = el.querySelector(sel);
            if (!child) continue;

            if (attrSet.has(prop.toLowerCase())) {
              result[prop] = child.getAttribute('href') ?? child.getAttribute('src') ?? '';
            } else {
              const raw =
                (child as HTMLElement).innerText?.trim() ?? child.textContent?.trim() ?? '';
              result[prop] = coerce(raw, propDefs[prop].type);
            }
            found = true;
            break;
          }

          if (!found) {
            const lcProp = prop.toLowerCase();
            const fallback =
              el.querySelector(`[class*="${lcProp}"]`) ?? el.querySelector(`[data-${lcProp}]`);
            if (fallback) {
              if (attrSet.has(lcProp)) {
                result[prop] = fallback.getAttribute('href') ?? fallback.getAttribute('src') ?? '';
              } else {
                const raw =
                  (fallback as HTMLElement).innerText?.trim() ?? fallback.textContent?.trim() ?? '';
                result[prop] = coerce(raw, propDefs[prop].type);
              }
            } else {
              result[prop] = null;
            }
          }
        }

        return result;
      },
      {
        propertyNames,
        properties,
        heuristics: PROPERTY_HEURISTICS,
        attrProps: [...ATTR_PROPERTIES],
      },
    );

    return { content: obj, title };
  }

  throw new ValidationError(
    `Unsupported schema type "${schema.type}" — expected "object" or "array"`,
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function pageTitle(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return '';
  }
}

/**
 * Trim an array of items so that its JSON-serialized form stays within
 * `maxLength` characters. Returns the largest prefix that fits.
 */
function trimArray(items: Array<unknown>, maxLength: number): Array<unknown> {
  let lo = 0;
  let hi = items.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (JSON.stringify(items.slice(0, mid)).length <= maxLength) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return items.slice(0, Math.max(lo, 1));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function extractContent(page: Page, options: ExtractOptions): Promise<ExtractResult> {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const url = page.url();

  logger.debug({ mode: options.mode, selector: options.selector }, 'extractContent');

  switch (options.mode) {
    case 'text': {
      const { content, title } = await extractText(page, options.selector, maxLength);
      return { content, url, title };
    }

    case 'markdown': {
      const { content, title } = await extractMarkdown(page, options.selector, maxLength);
      return { content, url, title };
    }

    case 'structured': {
      const { content, title } = await extractStructured(
        page,
        options.selector,
        options.schema,
        maxLength,
      );
      return { content, url, title };
    }

    default:
      throw new ValidationError(`Unknown extraction mode: "${(options as ExtractOptions).mode}"`);
  }
}
