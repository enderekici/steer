process.env.STEER_LOG_LEVEL = 'silent';

// Some tests (click, type) require a full Chromium environment with sufficient
// memory and a working compositor.  In constrained CI containers (cgroups ≤512 MB,
// no /dev/shm), the browser renderer process crashes on element interactions.
// Set SKIP_HEAVY_BROWSER_TESTS=1 to skip those tests.
const SKIP_HEAVY = !!process.env.SKIP_HEAVY_BROWSER_TESTS;

import path from 'node:path';
import {
  type Browser,
  type BrowserContext,
  type BrowserType,
  chromium,
  type ElementHandle,
  firefox,
  type Page,
  webkit,
} from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executeClick } from '../../src/actions/click.js';
import { executeAction } from '../../src/actions/index.js';
import { executeScroll } from '../../src/actions/scroll.js';
import { executeSelect } from '../../src/actions/select.js';
import { executeType } from '../../src/actions/type.js';
import type { Session } from '../../src/browser/session.js';
import { takeSnapshot } from '../../src/processing/snapshot.js';

const FIXTURES_DIR = path.resolve('test/fixtures');
const loginFormUrl = `file://${path.join(FIXTURES_DIR, 'login-form.html')}`;
const complexSpaUrl = `file://${path.join(FIXTURES_DIR, 'complex-spa.html')}`;
const tableDataUrl = `file://${path.join(FIXTURES_DIR, 'table-data.html')}`;

const browserTypes: Record<string, BrowserType> = { chromium, firefox, webkit };
const BROWSER_NAME = process.env.STEER_BROWSER || 'firefox';
const browserType = browserTypes[BROWSER_NAME] || firefox;
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-setuid-sandbox',
];

let browser: Browser;

beforeAll(async () => {
  const executablePath = process.env.STEER_EXECUTABLE_PATH || undefined;
  browser = await browserType.launch({
    headless: true,
    executablePath,
    args: LAUNCH_ARGS,
  });
});

afterAll(async () => {
  await browser?.close();
});

// Each describe gets a fresh context+page per test via beforeEach/afterEach
// to isolate Chromium crashes in constrained container environments.

// Click and type tests require a Chromium environment with enough memory for the
// renderer process.  They are skipped when SKIP_HEAVY_BROWSER_TESTS is set.
const heavyDescribe = SKIP_HEAVY ? describe.skip : describe;

heavyDescribe('executeType', () => {
  let context: BrowserContext;
  let page: Page;
  let refs: Map<string, ElementHandle>;

  function makeSession(): Session {
    return {
      id: 'test-session',
      page,
      refs,
      touch: () => undefined,
      getElementByRef: (r: string) => refs.get(r),
    } as unknown as Session;
  }

  async function goTo(url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const { snapshot, refMap } = await takeSnapshot(page);
    refs.clear();
    for (const [key, handle] of refMap) refs.set(key, handle);
    return snapshot;
  }

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    refs = new Map();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it('should type into text field using ref', async () => {
    const snap = await goTo(loginFormUrl);
    const input = snap.refs.find((r) => r.role === 'textbox' && r.name === 'Username');
    expect(input).toBeDefined();
    const result = await executeType(makeSession(), { ref: input?.ref }, 'testuser');
    expect(result.success).toBe(true);
    expect(
      result.snapshot.refs.find((r) => r.role === 'textbox' && r.name === 'Username')?.value,
    ).toBe('testuser');
  });

  it('should type using CSS selector', async () => {
    await goTo(loginFormUrl);
    const result = await executeType(makeSession(), { selector: '#username' }, 'selectortest');
    expect(result.success).toBe(true);
    expect(
      result.snapshot.refs.find((r) => r.role === 'textbox' && r.name === 'Username')?.value,
    ).toBe('selectortest');
  });
});

heavyDescribe('executeClick', () => {
  let context: BrowserContext;
  let page: Page;
  let refs: Map<string, ElementHandle>;

  function makeSession(): Session {
    return {
      id: 'test-session',
      page,
      refs,
      touch: () => undefined,
      getElementByRef: (r: string) => refs.get(r),
    } as unknown as Session;
  }

  async function goTo(url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const { snapshot, refMap } = await takeSnapshot(page);
    refs.clear();
    for (const [key, handle] of refMap) refs.set(key, handle);
    return snapshot;
  }

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    refs = new Map();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it('should click button by ref', async () => {
    const snap = await goTo(loginFormUrl);
    const btn = snap.refs.find((r) => r.role === 'button' && r.name === 'Sign In');
    expect(btn).toBeDefined();
    const result = await executeClick(makeSession(), { ref: btn?.ref });
    expect(result.success).toBe(true);
    for (const ref of result.snapshot.refs) expect(ref.ref).toMatch(/^r\d+$/);
  });

  it('should toggle checkbox state', async () => {
    const snap = await goTo(loginFormUrl);
    const cb = snap.refs.find((r) => r.role === 'checkbox');
    expect(cb?.checked).toBe(false);
    const result = await executeClick(makeSession(), { ref: cb?.ref });
    expect(result.snapshot.refs.find((r) => r.role === 'checkbox')?.checked).toBe(true);
  });

  it('should click by CSS selector', async () => {
    await goTo(loginFormUrl);
    const result = await executeClick(makeSession(), { selector: 'button[type="submit"]' });
    expect(result.success).toBe(true);
  });
});

describe('executeScroll', () => {
  let context: BrowserContext;
  let page: Page;
  let refs: Map<string, ElementHandle>;

  function makeSession(): Session {
    return {
      id: 'test-session',
      page,
      refs,
      touch: () => undefined,
      getElementByRef: (r: string) => refs.get(r),
    } as unknown as Session;
  }

  async function goTo(url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const { snapshot, refMap } = await takeSnapshot(page);
    refs.clear();
    for (const [key, handle] of refMap) refs.set(key, handle);
    return snapshot;
  }

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    refs = new Map();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it('should scroll down', async () => {
    await goTo(complexSpaUrl);
    const result = await executeScroll(makeSession(), 'down');
    expect(result.success).toBe(true);
    expect(result.snapshot.refs.length).toBeGreaterThan(0);
  });

  it.skipIf(SKIP_HEAVY)('should scroll element into view', async () => {
    await goTo(complexSpaUrl);
    const result = await executeScroll(makeSession(), 'down', { selector: '#deploy-btn' });
    expect(result.success).toBe(true);
  });
});

describe('executeSelect', () => {
  let context: BrowserContext;
  let page: Page;
  let refs: Map<string, ElementHandle>;

  function makeSession(): Session {
    return {
      id: 'test-session',
      page,
      refs,
      touch: () => undefined,
      getElementByRef: (r: string) => refs.get(r),
    } as unknown as Session;
  }

  async function goTo(url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const { snapshot, refMap } = await takeSnapshot(page);
    refs.clear();
    for (const [key, handle] of refMap) refs.set(key, handle);
    return snapshot;
  }

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    refs = new Map();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it('should select option by ref', async () => {
    const snap = await goTo(tableDataUrl);
    const sel = snap.refs.find((r) => r.role === 'combobox');
    expect(sel).toBeDefined();
    const result = await executeSelect(makeSession(), { ref: sel?.ref }, 'electronics');
    expect(result.success).toBe(true);
    expect(result.snapshot.refs.find((r) => r.role === 'combobox')?.value).toBe('Electronics');
  });

  it('should select by CSS selector', async () => {
    await goTo(tableDataUrl);
    const result = await executeSelect(makeSession(), { selector: '#category' }, 'books');
    expect(result.success).toBe(true);
    expect(result.snapshot.refs.find((r) => r.role === 'combobox')?.value).toBe('Books');
  });
});

describe('executeAction dispatcher', () => {
  let context: BrowserContext;
  let page: Page;
  let refs: Map<string, ElementHandle>;

  function makeSession(): Session {
    return {
      id: 'test-session',
      page,
      refs,
      touch: () => undefined,
      getElementByRef: (r: string) => refs.get(r),
    } as unknown as Session;
  }

  async function goTo(url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const { snapshot, refMap } = await takeSnapshot(page);
    refs.clear();
    for (const [key, handle] of refMap) refs.set(key, handle);
    return snapshot;
  }

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    refs = new Map();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it.skipIf(SKIP_HEAVY)('should dispatch click', async () => {
    const snap = await goTo(loginFormUrl);
    const btn = snap.refs.find((r) => r.role === 'button');
    const result = await executeAction(makeSession(), 'click', { target: { ref: btn?.ref } });
    expect(result.success).toBe(true);
  });

  it.skipIf(SKIP_HEAVY)('should dispatch type', async () => {
    const snap = await goTo(loginFormUrl);
    const input = snap.refs.find((r) => r.role === 'textbox');
    const result = await executeAction(makeSession(), 'type', {
      target: { ref: input?.ref },
      value: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('should throw for unknown action', async () => {
    await goTo(loginFormUrl);
    await expect(executeAction(makeSession(), 'unknown', {})).rejects.toThrow('Unknown action');
  });

  it('should throw when type missing value', async () => {
    const snap = await goTo(loginFormUrl);
    const input = snap.refs.find((r) => r.role === 'textbox');
    await expect(
      executeAction(makeSession(), 'type', { target: { ref: input?.ref } }),
    ).rejects.toThrow('requires a "value" parameter');
  });

  it('should throw when click missing target', async () => {
    await goTo(loginFormUrl);
    await expect(executeAction(makeSession(), 'click', {})).rejects.toThrow('requires a target');
  });
});
