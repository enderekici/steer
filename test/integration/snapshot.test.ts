process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.ABBWAK_LOG_LEVEL = 'silent';

import path from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatSnapshot, takeSnapshot } from '../../src/processing/snapshot.js';

const FIXTURES_DIR = path.resolve('test/fixtures');
const loginFormUrl = `file://${path.join(FIXTURES_DIR, 'login-form.html')}`;
const complexSpaUrl = `file://${path.join(FIXTURES_DIR, 'complex-spa.html')}`;
const searchResultsUrl = `file://${path.join(FIXTURES_DIR, 'search-results.html')}`;
const tableDataUrl = `file://${path.join(FIXTURES_DIR, 'table-data.html')}`;

const CHROME_PATH =
  process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';

let browser: Browser;
let ctx: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--single-process'],
  });
  ctx = await browser.newContext();
  page = await ctx.newPage();
});

afterAll(async () => {
  await ctx?.close();
  await browser?.close();
});

// ── login-form.html ─────────────────────────────────────────────────────────

describe('takeSnapshot on login-form.html', () => {
  beforeAll(async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
  });

  it('should return a snapshot with url and title', async () => {
    const { snapshot } = await takeSnapshot(page);
    expect(snapshot.url).toContain('login-form.html');
    expect(snapshot.title).toBe('Login Page');
  });

  it('should find the h1 heading element', async () => {
    const { snapshot } = await takeSnapshot(page);
    const heading = snapshot.refs.find((r) => r.role === 'heading' && r.name.includes('Sign In'));
    expect(heading).toBeDefined();
  });

  it('should find the username text input', async () => {
    const { snapshot } = await takeSnapshot(page);
    const username = snapshot.refs.find((r) => r.role === 'textbox' && r.name === 'Username');
    expect(username).toBeDefined();
    expect(username?.value).toBeDefined();
  });

  it('should find the password input as textbox', async () => {
    const { snapshot } = await takeSnapshot(page);
    const password = snapshot.refs.find((r) => r.role === 'textbox' && r.name === 'Password');
    expect(password).toBeDefined();
  });

  it('should find the remember checkbox', async () => {
    const { snapshot } = await takeSnapshot(page);
    const checkbox = snapshot.refs.find((r) => r.role === 'checkbox' && r.name === 'Remember me');
    expect(checkbox).toBeDefined();
    expect(checkbox?.checked).toBe(false);
  });

  it('should find the Sign In button', async () => {
    const { snapshot } = await takeSnapshot(page);
    const btn = snapshot.refs.find((r) => r.role === 'button' && r.name === 'Sign In');
    expect(btn).toBeDefined();
  });

  it('should find links (Forgot password, Create one)', async () => {
    const { snapshot } = await takeSnapshot(page);
    const links = snapshot.refs.filter((r) => r.role === 'link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    const forgotLink = links.find((l) => l.name.includes('Forgot'));
    expect(forgotLink).toBeDefined();
  });

  it('should assign ref IDs starting with r', async () => {
    const { snapshot } = await takeSnapshot(page);
    for (const ref of snapshot.refs) {
      expect(ref.ref).toMatch(/^r\d+$/);
    }
  });

  it('should populate refMap with element handles for every ref', async () => {
    const { snapshot, refMap } = await takeSnapshot(page);
    expect(refMap.size).toBe(snapshot.refs.length);
    for (const ref of snapshot.refs) {
      expect(refMap.has(ref.ref)).toBe(true);
    }
  });
});

// ── complex-spa.html ────────────────────────────────────────────────────────

describe('takeSnapshot on complex-spa.html', () => {
  beforeAll(async () => {
    await page.goto(complexSpaUrl, { waitUntil: 'load' });
  });

  it('should find tab elements with role=tab', async () => {
    const { snapshot } = await takeSnapshot(page);
    const tabs = snapshot.refs.filter((r) => r.role === 'tab');
    expect(tabs.length).toBe(3);
    const tabNames = tabs.map((t) => t.name);
    expect(tabNames).toContain('Overview');
    expect(tabNames).toContain('Analytics');
    expect(tabNames).toContain('Reports');
  });

  it('should find the alert notification', async () => {
    const { snapshot } = await takeSnapshot(page);
    const alert = snapshot.refs.find((r) => r.role === 'alert');
    expect(alert).toBeDefined();
    expect(alert?.name).toContain('unread notifications');
  });

  it('should find nav links', async () => {
    const { snapshot } = await takeSnapshot(page);
    const links = snapshot.refs.filter((r) => r.role === 'link');
    const linkNames = links.map((l) => l.name);
    expect(linkNames).toContain('Dashboard');
    expect(linkNames).toContain('Projects');
    expect(linkNames).toContain('Settings');
  });

  it('should find buttons including Profile, Dismiss, Deploy Now', async () => {
    const { snapshot } = await takeSnapshot(page);
    const buttons = snapshot.refs.filter((r) => r.role === 'button');
    const buttonNames = buttons.map((b) => b.name);
    expect(buttonNames).toContain('Profile');
    expect(buttonNames).toContain('Dismiss');
    expect(buttonNames).toContain('Deploy Now');
  });

  it('should find the nav-search input', async () => {
    const { snapshot } = await takeSnapshot(page);
    const searchInput = snapshot.refs.find((r) => r.role === 'textbox' && r.name === 'Search...');
    expect(searchInput).toBeDefined();
  });

  it('should find heading elements', async () => {
    const { snapshot } = await takeSnapshot(page);
    const headings = snapshot.refs.filter((r) => r.role === 'heading');
    const headingNames = headings.map((h) => h.name);
    expect(headingNames).toContain('Active Projects');
    expect(headingNames).toContain('Recent Activity');
    expect(headingNames).toContain('Scrollable List');
  });
});

// ── formatSnapshot ──────────────────────────────────────────────────────────

describe('formatSnapshot', () => {
  it('should produce readable text with Page and URL header lines', async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toContain('Page: Login Page');
    expect(text).toContain('URL:');
    expect(text).toContain('login-form.html');
  });

  it('should include ref IDs, roles, and names in bracket format', async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toMatch(/\[r\d+\] heading "Sign In"/);
    expect(text).toMatch(/\[r\d+\] textbox "Username"/);
    expect(text).toMatch(/\[r\d+\] button "Sign In"/);
  });

  it('should show value for input fields', async () => {
    await page.goto(searchResultsUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toContain('value="headless browser"');
  });

  it('should show checked state for checkboxes', async () => {
    await page.goto(loginFormUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toContain('checked=false');
  });

  it('should show disabled state for disabled buttons', async () => {
    await page.goto(tableDataUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toContain('(disabled)');
  });

  it('should show options for select elements', async () => {
    await page.goto(tableDataUrl, { waitUntil: 'load' });
    const { snapshot } = await takeSnapshot(page);
    const text = formatSnapshot(snapshot);

    expect(text).toContain('options=');
    expect(text).toContain('"All"');
    expect(text).toContain('"Electronics"');
  });

  it('should handle empty refs with "(no interactive elements found)"', () => {
    const text = formatSnapshot({ url: 'about:blank', title: '', refs: [] });
    expect(text).toContain('(no interactive elements found)');
  });
});
