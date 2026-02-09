import type { ElementHandle, Page } from 'playwright';
import type { PageSnapshot, RefElement } from '../browser/session.js';
import { logger } from '../utils/logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 100;
const DATA_ATTR = 'data-steer-ref';

/**
 * Interactive element selectors -- anything a user can click, type into, or
 * toggle.
 */
const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'textarea',
  'select',
  'details > summary',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=menuitemcheckbox]',
  '[role=menuitemradio]',
  '[role=switch]',
  '[role=slider]',
  '[role=combobox]',
  '[role=option]',
  '[role=spinbutton]',
  '[role=searchbox]',
  '[role=treeitem]',
  '[contenteditable=true]',
  "[contenteditable='']",
].join(',');

/**
 * Meaningful content selectors -- headings, landmarks, alerts, and images
 * with alt text that give the agent spatial/contextual awareness.
 */
const MEANINGFUL_SELECTORS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  '[role=heading]',
  '[role=alert]',
  '[role=alertdialog]',
  '[role=status]',
  '[role=dialog]',
  'img[alt]',
  '[aria-live]',
].join(',');

// ── Serialisable type returned from page.evaluate ───────────────────────────

interface RawElement {
  refId: string;
  tag: string;
  role: string;
  name: string;
  value: string | undefined;
  disabled: boolean;
  checked: boolean | undefined;
  expanded: boolean | undefined;
  options: string[] | undefined;
  description: string | undefined;
}

// ── Snapshot options ────────────────────────────────────────────────────────

export type SnapshotVerbosity = 'minimal' | 'normal' | 'detailed';

export interface SnapshotOptions {
  /** Restrict snapshot to elements within this CSS selector scope. */
  scope?: string;
  /** Controls how much information is returned per element. */
  verbosity?: SnapshotVerbosity;
  /** Maximum number of refs to return (for pagination on large pages). */
  maxRefs?: number;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Capture an accessibility-oriented snapshot of the current page.
 *
 * Returns both a serialisable {@link PageSnapshot} (safe to send over JSON)
 * and a `refMap` that maps every ref id back to its live `ElementHandle` so
 * the caller can interact with the element directly.
 *
 * The approach:
 *  1. A single `page.evaluate()` call walks the DOM, filters hidden
 *     elements, computes accessible names, and stamps each surviving
 *     element with `data-steer-ref="rN"`.
 *  2. Back in Node we iterate the results and call `page.$()` to obtain
 *     a live ElementHandle for each stamped element.  This guarantees a
 *     reliable 1:1 mapping (unlike querying `$$` separately which can
 *     get out of sync with the filtered set).
 */
export async function takeSnapshot(
  page: Page,
  options: SnapshotOptions = {},
): Promise<{ snapshot: PageSnapshot; refMap: Map<string, ElementHandle> }> {
  const [url, title] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ''),
  ]);

  const verbosity = options.verbosity ?? 'normal';
  const maxRefs = options.maxRefs ?? 0; // 0 = unlimited

  // ── 1. Collect element data inside the browser ────────────────────────

  // tsx/esbuild with keepNames:true wraps const declarations with __name()
  // at module scope. When Playwright serialises the evaluate callback, those
  // references become unresolvable in the browser.  Inject a global shim so
  // they become harmless no-ops.  Using a string avoids the same transform.
  await page.evaluate(
    "if(typeof __name==='undefined'){var __name=function(t,v){Object.defineProperty(t,'name',{value:v,configurable:true});return t}}",
  );

  const rawElements: RawElement[] = await page.evaluate(
    ({
      interactiveSel,
      meaningfulSel,
      dataAttr,
      maxLen,
      scopeSelector,
      maxRefsLimit,
    }: {
      interactiveSel: string;
      meaningfulSel: string;
      dataAttr: string;
      maxLen: number;
      scopeSelector: string;
      maxRefsLimit: number;
    }) => {
      // -- helpers (run inside the browser) --------------------------------

      const truncate = (text: string, limit: number): string => {
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (cleaned.length <= limit) return cleaned;
        return `${cleaned.slice(0, limit - 3)}...`;
      };

      const isHidden = (el: Element): boolean => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.hidden) return true;
        if (el.getAttribute('aria-hidden') === 'true') return true;
        if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'hidden') return true;

        const style = window.getComputedStyle(el);
        if (style.display === 'none') return true;
        if (style.visibility === 'hidden') return true;
        if (style.opacity === '0') return true;

        if (el.offsetWidth === 0 && el.offsetHeight === 0) {
          if (!el.getAttribute('role')) return true;
        }

        return false;
      };

      const isAncestorHidden = (el: Element): boolean => {
        let current: Element | null = el;
        while (current) {
          if (isHidden(current)) return true;
          current = current.parentElement;
        }
        return false;
      };

      const getImplicitRole = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        switch (tag) {
          case 'a':
            return el.hasAttribute('href') ? 'link' : '';
          case 'button':
            return 'button';
          case 'input': {
            const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
            const map: Record<string, string> = {
              button: 'button',
              checkbox: 'checkbox',
              email: 'textbox',
              image: 'button',
              number: 'spinbutton',
              password: 'textbox',
              radio: 'radio',
              range: 'slider',
              reset: 'button',
              search: 'searchbox',
              submit: 'button',
              tel: 'textbox',
              text: 'textbox',
              url: 'textbox',
            };
            return map[type] ?? 'textbox';
          }
          case 'textarea':
            return 'textbox';
          case 'select':
            return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
          case 'option':
            return 'option';
          case 'summary':
            return 'button';
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            return 'heading';
          case 'img':
            return 'img';
          case 'dialog':
            return 'dialog';
          default:
            return '';
        }
      };

      const getAccessibleName = (el: Element): string => {
        if (!(el instanceof HTMLElement)) return '';

        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const parts = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .filter(Boolean);
          if (parts.length > 0) return parts.join(' ');
        }

        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel?.trim()) return ariaLabel.trim();

        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement
        ) {
          if (el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label?.textContent?.trim()) return label.textContent.trim();
          }
          const parentLabel = el.closest('label');
          if (parentLabel) {
            const clone = parentLabel.cloneNode(true) as HTMLElement;
            for (const child of clone.querySelectorAll('input,textarea,select')) {
              child.remove();
            }
            const text = clone.textContent?.trim();
            if (text) return text;
          }
        }

        if (el instanceof HTMLImageElement && el.alt) return el.alt;
        if (el instanceof HTMLInputElement && el.type === 'image' && el.alt) return el.alt;

        const titleAttr = el.getAttribute('title');
        if (titleAttr?.trim()) return titleAttr.trim();

        if (
          (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
          el.placeholder?.trim()
        )
          return el.placeholder.trim();

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') ?? '';
        const textContentRoles = new Set([
          'button',
          'link',
          'tab',
          'menuitem',
          'menuitemcheckbox',
          'menuitemradio',
          'treeitem',
          'heading',
          'option',
          'alert',
          'status',
        ]);
        const textContentTags = new Set([
          'button',
          'a',
          'summary',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'option',
        ]);

        if (textContentRoles.has(role) || textContentTags.has(tag)) {
          const text = el.textContent?.trim();
          if (text) return text;
        }

        if (el instanceof HTMLInputElement) {
          const t = el.type.toLowerCase();
          if ((t === 'submit' || t === 'reset' || t === 'button') && el.value) {
            return el.value;
          }
        }

        return '';
      };

      const getElementValue = (el: Element): string | undefined => {
        if (el instanceof HTMLInputElement) {
          const type = el.type.toLowerCase();
          if (type === 'checkbox' || type === 'radio') return undefined;
          if (type === 'password') return el.value ? '••••' : '';
          return el.value;
        }
        if (el instanceof HTMLTextAreaElement) return el.value;
        if (el instanceof HTMLSelectElement) {
          const selected = el.options[el.selectedIndex];
          return selected?.textContent?.trim() ?? el.value;
        }
        if (
          el.getAttribute('contenteditable') === 'true' ||
          el.getAttribute('contenteditable') === ''
        ) {
          return el.textContent?.trim() ?? '';
        }
        return undefined;
      };

      const getSelectOptions = (el: Element): string[] | undefined => {
        if (!(el instanceof HTMLSelectElement)) return undefined;
        return Array.from(el.options).map((o) => o.textContent?.trim() ?? o.value);
      };

      // -- main collection logic -------------------------------------------

      // Determine the root element to search within
      const root = scopeSelector ? (document.querySelector(scopeSelector) ?? document) : document;

      // Clear previous ref markers.
      for (const old of document.querySelectorAll(`[${dataAttr}]`)) {
        old.removeAttribute(dataAttr);
      }

      const seen = new Set<Element>();
      const results: Array<{
        refId: string;
        tag: string;
        role: string;
        name: string;
        value: string | undefined;
        disabled: boolean;
        checked: boolean | undefined;
        expanded: boolean | undefined;
        options: string[] | undefined;
        description: string | undefined;
      }> = [];

      const allSel = `${interactiveSel},${meaningfulSel}`;
      const candidates = root.querySelectorAll(allSel);

      let refCounter = 0;

      for (const el of candidates) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Enforce maxRefs limit
        if (maxRefsLimit > 0 && refCounter >= maxRefsLimit) break;

        // Skip hidden elements.
        if (isAncestorHidden(el)) continue;

        // Determine role.
        const explicitRole = el.getAttribute('role')?.trim().toLowerCase() ?? '';
        const role = explicitRole || getImplicitRole(el);
        if (!role) continue;

        // Determine accessible name.
        const rawName = getAccessibleName(el);
        const name = truncate(rawName, maxLen);

        // Determine value.
        const rawValue = getElementValue(el);

        // Skip elements with absolutely no name and no value -- they give
        // the agent nothing to work with.
        if (!name && rawValue === undefined) continue;

        refCounter++;
        const refId = `r${refCounter}`;

        // Stamp the element so we can retrieve an ElementHandle later.
        el.setAttribute(dataAttr, refId);

        // Disabled state.
        const disabled =
          (el instanceof HTMLElement &&
            ('disabled' in el
              ? (el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled === true
              : false)) ||
          el.getAttribute('aria-disabled') === 'true';

        // Checked state.
        let checked: boolean | undefined;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          checked = el.checked;
        } else if (el.getAttribute('aria-checked') != null) {
          checked = el.getAttribute('aria-checked') === 'true';
        }

        // Expanded state.
        let expanded: boolean | undefined;
        const ariaExpanded = el.getAttribute('aria-expanded');
        if (ariaExpanded != null) {
          expanded = ariaExpanded === 'true';
        }

        // Description via aria-describedby.
        let description: string | undefined;
        const descAttr = el.getAttribute('aria-describedby');
        if (descAttr) {
          const parts = descAttr
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .filter(Boolean);
          if (parts.length > 0) {
            description = truncate(parts.join(' '), maxLen);
          }
        }

        const value = rawValue !== undefined ? truncate(rawValue, maxLen) : undefined;

        results.push({
          refId,
          tag: el.tagName.toLowerCase(),
          role,
          name,
          value,
          disabled,
          checked,
          expanded,
          options: getSelectOptions(el)?.map((o) => truncate(o, maxLen)),
          description,
        });
      }

      return results;
    },
    {
      interactiveSel: INTERACTIVE_SELECTORS,
      meaningfulSel: MEANINGFUL_SELECTORS,
      dataAttr: DATA_ATTR,
      maxLen: MAX_TEXT_LENGTH,
      scopeSelector: options.scope ?? '',
      maxRefsLimit: maxRefs,
    },
  );

  // ── 2. Build RefElement list and resolve ElementHandles ───────────────

  const refs: RefElement[] = [];
  const refMap = new Map<string, ElementHandle>();

  for (const raw of rawElements) {
    const refEl: RefElement = {
      ref: raw.refId,
      role: raw.role,
      name: raw.name,
    };

    // Verbosity filtering
    if (verbosity !== 'minimal') {
      if (raw.value !== undefined) refEl.value = raw.value;
      if (raw.disabled) refEl.disabled = true;
      if (raw.checked !== undefined) refEl.checked = raw.checked;
      if (raw.expanded !== undefined) refEl.expanded = raw.expanded;
    }

    if (verbosity === 'detailed') {
      if (raw.options && raw.options.length > 0) refEl.options = raw.options;
      if (raw.description) refEl.description = raw.description;
    } else if (verbosity === 'normal') {
      if (raw.options && raw.options.length > 0) refEl.options = raw.options;
    }

    refs.push(refEl);

    try {
      const handle = await page.$(`[${DATA_ATTR}="${raw.refId}"]`);
      if (handle) {
        refMap.set(raw.refId, handle);
      }
    } catch {
      logger.debug({ ref: raw.refId }, 'Could not resolve ElementHandle for ref');
    }
  }

  logger.debug(
    { url, elementCount: refs.length, verbosity, scope: options.scope },
    'Snapshot captured',
  );

  return {
    snapshot: { url, title, refs },
    refMap,
  };
}

/**
 * Render a human/agent-readable text representation of the snapshot.
 */
export function formatSnapshot(snapshot: PageSnapshot): string {
  const lines: string[] = [`Page: ${snapshot.title}`, `URL:  ${snapshot.url}`, ''];

  if (snapshot.refs.length === 0) {
    lines.push('(no interactive elements found)');
    return lines.join('\n');
  }

  for (const el of snapshot.refs) {
    let line = `[${el.ref}] ${el.role}`;
    if (el.name) line += ` "${el.name}"`;
    if (el.value !== undefined) line += ` value="${el.value}"`;
    if (el.checked !== undefined) line += ` checked=${el.checked}`;
    if (el.disabled) line += ' (disabled)';
    if (el.expanded !== undefined) line += ` expanded=${el.expanded}`;
    if (el.options) line += ` options=[${el.options.map((o) => `"${o}"`).join(', ')}]`;
    if (el.description) line += ` -- ${el.description}`;
    lines.push(line);
  }

  return lines.join('\n');
}
