process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import path from 'node:path';
import {
  type Browser,
  type BrowserContext,
  type BrowserType,
  chromium,
  firefox,
  type Page,
  webkit,
} from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractContent } from '../../src/processing/content.js';

const FIXTURES_DIR = path.resolve('test/fixtures');
const searchResultsUrl = `file://${path.join(FIXTURES_DIR, 'search-results.html')}`;
const tableDataUrl = `file://${path.join(FIXTURES_DIR, 'table-data.html')}`;
const loginFormUrl = `file://${path.join(FIXTURES_DIR, 'login-form.html')}`;

const browserTypes: Record<string, BrowserType> = { chromium, firefox, webkit };
const BROWSER_NAME = process.env.STEER_BROWSER || 'firefox';
const browserType = browserTypes[BROWSER_NAME] || firefox;

let browser: Browser;
let ctx: BrowserContext;
let page: Page;

beforeAll(async () => {
  const executablePath = process.env.STEER_EXECUTABLE_PATH || undefined;
  browser = await browserType.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--single-process'],
  });
  ctx = await browser.newContext();
  page = await ctx.newPage();
});

afterAll(async () => {
  await ctx?.close();
  await browser?.close();
});

// ── Text extraction ─────────────────────────────────────────────────────────

describe('extractContent mode=text', () => {
  beforeAll(async () => {
    await page.goto(searchResultsUrl, { waitUntil: 'load' });
  });

  it('should return text content from search-results.html', async () => {
    const result = await extractContent(page, { mode: 'text' });
    expect(result.url).toContain('search-results.html');
    expect(result.title).toBeDefined();
    expect(typeof result.content).toBe('string');
    const text = result.content as string;
    expect(text.length).toBeGreaterThan(0);
  });

  it('should contain search result descriptions in text output', async () => {
    const result = await extractContent(page, { mode: 'text' });
    const text = result.content as string;
    expect(text).toContain('Playwright');
  });

  it('should respect maxLength for text mode', async () => {
    const result = await extractContent(page, { mode: 'text', maxLength: 50 });
    const text = result.content as string;
    expect(text.length).toBeLessThanOrEqual(50);
  });

  it('should extract text from a scoped selector', async () => {
    const result = await extractContent(page, {
      mode: 'text',
      selector: '#results',
    });
    const text = result.content as string;
    expect(text).toContain('Playwright');
    expect(text).toContain('Puppeteer');
  });

  it('should return empty string for a non-matching selector', async () => {
    const result = await extractContent(page, {
      mode: 'text',
      selector: '#nonexistent',
    });
    expect(result.content).toBe('');
  });
});

// ── Markdown extraction ─────────────────────────────────────────────────────

describe('extractContent mode=markdown', () => {
  beforeAll(async () => {
    await page.goto(searchResultsUrl, { waitUntil: 'load' });
  });

  it('should return markdown content from search-results.html', async () => {
    const result = await extractContent(page, { mode: 'markdown' });
    expect(typeof result.content).toBe('string');
    const md = result.content as string;
    expect(md.length).toBeGreaterThan(0);
  });

  it('should contain markdown heading syntax', async () => {
    const result = await extractContent(page, { mode: 'markdown' });
    const md = result.content as string;
    expect(md).toContain('#');
  });

  it('should contain markdown link syntax', async () => {
    const result = await extractContent(page, { mode: 'markdown' });
    const md = result.content as string;
    expect(md).toMatch(/\[.*?\]\(.*?\)/);
  });

  it('should respect maxLength for markdown mode', async () => {
    const result = await extractContent(page, { mode: 'markdown', maxLength: 100 });
    const md = result.content as string;
    expect(md.length).toBeLessThanOrEqual(100);
  });

  it('should extract markdown from a scoped selector', async () => {
    const result = await extractContent(page, {
      mode: 'markdown',
      selector: '.pagination',
    });
    const md = result.content as string;
    expect(md.length).toBeGreaterThan(0);
  });
});

// ── Structured extraction ───────────────────────────────────────────────────

describe('extractContent mode=structured', () => {
  beforeAll(async () => {
    await page.goto(tableDataUrl, { waitUntil: 'load' });
  });

  it('should extract product data as an array of objects', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      selector: '.product',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
          },
        },
      },
    });

    expect(Array.isArray(result.content)).toBe(true);
    const items = result.content as Array<Record<string, unknown>>;
    expect(items.length).toBe(3);
  });

  it('should extract correct product names', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      selector: '.product',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
          },
        },
      },
    });

    const items = result.content as Array<Record<string, unknown>>;
    const names = items.map((i) => i.name);
    expect(names).toContain('Wireless Mouse');
    expect(names).toContain('TypeScript Handbook');
    expect(names).toContain('USB-C Cable');
  });

  it('should extract correct prices', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      selector: '.product',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
          },
        },
      },
    });

    const items = result.content as Array<Record<string, unknown>>;
    const prices = items.map((i) => i.price);
    expect(prices).toContain('$29.99');
    expect(prices).toContain('$39.99');
    expect(prices).toContain('$12.99');
  });

  it('should extract additional properties when specified', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      selector: '.product',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    });

    const items = result.content as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('description');
    }
  });

  it('should extract a single object with schema type=object', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
      },
    });

    expect(typeof result.content).toBe('object');
    expect(Array.isArray(result.content)).toBe(false);
    const obj = result.content as Record<string, unknown>;
    expect(obj.title).toBe('Product Catalog');
  });

  it('should return url and title in the result', async () => {
    const result = await extractContent(page, {
      mode: 'structured',
      selector: '.product',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    });

    expect(result.url).toContain('table-data.html');
    expect(result.title).toBe('Product Catalog');
  });

  it('should throw ValidationError when schema is missing', async () => {
    await expect(extractContent(page, { mode: 'structured' })).rejects.toThrow('requires a schema');
  });

  it('should throw ValidationError when array schema lacks a selector', async () => {
    await expect(
      extractContent(page, {
        mode: 'structured',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      }),
    ).rejects.toThrow('requires a selector');
  });

  it('should throw ValidationError for unsupported schema type', async () => {
    await expect(
      extractContent(page, {
        mode: 'structured',
        schema: { type: 'string' },
      }),
    ).rejects.toThrow('Unsupported schema type');
  });
});

// ── maxLength truncation across modes ───────────────────────────────────────

describe('extractContent maxLength truncation', () => {
  it('should truncate text output to maxLength', async () => {
    await page.goto(searchResultsUrl, { waitUntil: 'load' });
    const result = await extractContent(page, { mode: 'text', maxLength: 30 });
    const text = result.content as string;
    expect(text.length).toBeLessThanOrEqual(30);
  });

  it('should truncate markdown output to maxLength', async () => {
    await page.goto(searchResultsUrl, { waitUntil: 'load' });
    const result = await extractContent(page, { mode: 'markdown', maxLength: 40 });
    const md = result.content as string;
    expect(md.length).toBeLessThanOrEqual(40);
  });

  it('should use default maxLength of 4000 when not specified', async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
    const result = await extractContent(page, { mode: 'text' });
    const text = result.content as string;
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.length).toBeGreaterThan(0);
  });
});

// ── Invalid mode ────────────────────────────────────────────────────────────

describe('extractContent invalid mode', () => {
  it('should throw ValidationError for unknown mode', async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
    await expect(extractContent(page, { mode: 'xml' as 'text' })).rejects.toThrow(
      'Unknown extraction mode',
    );
  });
});
