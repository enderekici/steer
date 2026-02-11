# Testing

Comprehensive guide to testing steer.

---

## Test Structure

```
test/
├── unit/                        # Pure unit tests (no browser required)
│   ├── config.test.ts           # Config defaults and env var parsing
│   ├── errors.test.ts           # Error class hierarchy and serialization
│   ├── sanitize.test.ts         # URL, selector, and text sanitization
│   ├── resolve.test.ts          # Retry logic and error classification
│   └── cli.test.ts              # CLI --help output
│
├── integration/                 # Integration tests (browser required)
│   ├── api.test.ts              # Full REST API lifecycle
│   ├── actions.test.ts          # Direct action execution (click, type, select, scroll)
│   ├── snapshot.test.ts         # DOM snapshot and ref stamping
│   ├── content.test.ts          # Content extraction (text, markdown, structured)
│   └── enhancements.test.ts     # Observe options, session TTL, validation
│
└── fixtures/                    # Static HTML files used by integration tests
    ├── login-form.html          # Login form with inputs, checkbox, links
    ├── table-data.html          # Product catalog with table and select dropdown
    ├── search-results.html      # Search results with links and pagination
    └── complex-spa.html         # Dashboard with tabs, alerts, scroll areas
```

---

## Running Tests

### All tests

```bash
npm test
```

### Unit tests only

Unit tests do not require a browser and run quickly (~72 tests).

```bash
npm test -- test/unit/
```

### Integration tests only

Integration tests launch a real browser and exercise Playwright interactions.

```bash
npm test -- test/integration/
```

### Single test file

```bash
npm test -- test/unit/sanitize.test.ts
npm test -- test/integration/api.test.ts
```

### Watch mode

Re-runs tests on file changes. Useful during development.

```bash
npm run test:watch
```

### Coverage

Generates a coverage report using the v8 provider.

```bash
npm run test:coverage
```

Coverage reports are generated in multiple formats:
- `text` -- printed to the terminal
- `json` -- machine-readable JSON
- `html` -- browsable HTML report
- `lcov` -- for CI/CD integration

### UI mode

Opens the Vitest UI in a browser for interactive test exploration.

```bash
npm run test:ui
```

---

## Test Configuration

The test configuration lives in `vitest.config.ts`.

| Setting | Value | Purpose |
|---------|-------|---------|
| `globals` | `true` | Enables global `describe`, `it`, `expect` |
| `environment` | `node` | Tests run in Node.js (not jsdom) |
| `testTimeout` | `30000` | 30 seconds per individual test |
| `hookTimeout` | `30000` | 30 seconds for `beforeAll`/`afterAll` hooks |
| `fileParallelism` | `false` | Tests run sequentially (shared browser instance) |
| `include` | `test/**/*.test.ts` | Test file discovery pattern |

### Coverage configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `provider` | `v8` | Uses V8's built-in coverage |
| `reporter` | `text, json, html, lcov` | Multiple output formats |
| `include` | `src/**/*.ts` | Source files to measure |
| `all` | `true` | Reports on all source files, even untested ones |
| `clean` | `true` | Clears previous coverage data before each run |

Coverage excludes:
- `dist/`, `node_modules/`, `test/`
- Test files (`*.test.ts`, `*.spec.ts`)
- Type-only files (`**/types.ts`)
- Entry point (`src/index.ts`)

---

## Writing New Tests

### Unit test template

Unit tests should not require a browser. They test pure functions and classes.

```typescript
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it } from 'vitest';
import { myFunction } from '../../src/utils/mymodule.js';

describe('myFunction', () => {
  it('should handle the base case', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction('')).toThrow('error message');
  });
});
```

### Integration test template

Integration tests launch a browser and interact with HTML fixture files.

```typescript
process.env.STEER_LOG_LEVEL = 'silent';

import path from 'node:path';
import {
  type Browser,
  type BrowserContext,
  type BrowserType,
  firefox,
  type Page,
} from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const FIXTURES_DIR = path.resolve('test/fixtures');
const fixtureUrl = `file://${path.join(FIXTURES_DIR, 'login-form.html')}`;

const browserType = firefox;
let browser: Browser;

beforeAll(async () => {
  const executablePath = process.env.STEER_EXECUTABLE_PATH || undefined;
  browser = await browserType.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
});

afterAll(async () => {
  await browser?.close();
});

describe('my integration test', () => {
  let context: BrowserContext;
  let page: Page;

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close().catch(() => undefined);
  });

  it('should navigate and interact', async () => {
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
    // ... test logic
  });
});
```

### REST API integration test template

API tests use Fastify's `inject()` method to simulate HTTP requests without starting a real server.

```typescript
process.env.STEER_LOG_LEVEL = 'silent';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserEngine } from '../../src/browser/engine.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { buildApp } from '../../src/server/app.js';

let engine: BrowserEngine;
let sessions: SessionManager;
let app: FastifyInstance;

beforeAll(async () => {
  engine = new BrowserEngine();
  await engine.launch({ headless: true });
  sessions = new SessionManager(engine);
  app = buildApp(sessions);
  await app.ready();
});

afterAll(async () => {
  sessions?.stopCleanup();
  await sessions?.destroyAll();
  await engine?.close();
  await app?.close();
});

function inject(method: string, url: string, payload?: unknown) {
  const opts: Record<string, unknown> = { method, url };
  if (payload !== undefined) {
    opts.payload = payload;
    opts.headers = { 'content-type': 'application/json' };
  }
  return app.inject(opts as any);
}

describe('my API test', () => {
  it('should return 200', async () => {
    const res = await inject('GET', '/health');
    expect(res.statusCode).toBe(200);
  });
});
```

### Adding tests for a new action

When adding a new browser action, add tests in `test/integration/actions.test.ts`:

1. Create a new `describe` block for the action.
2. Set up `beforeEach`/`afterEach` to create and close a fresh browser context.
3. Navigate to the appropriate fixture page.
4. Take a snapshot to populate refs.
5. Execute the action and verify the result.

If the action requires heavy browser interaction (rendering, compositor), wrap it with `SKIP_HEAVY`:

```typescript
const SKIP_HEAVY = !!process.env.SKIP_HEAVY_BROWSER_TESTS;
const heavyDescribe = SKIP_HEAVY ? describe.skip : describe;

heavyDescribe('myHeavyAction', () => {
  // tests that may OOM in constrained containers
});
```

---

## Test Fixtures

The `test/fixtures/` directory contains static HTML files served to the browser during tests. Integration tests either load them via `file://` URLs or serve them over HTTP using a Node.js HTTP server on a random port.

### login-form.html

A standard login page with:
- Text input (username)
- Password input
- "Remember me" checkbox
- Submit button
- Navigation links ("Forgot password?", "Create one")
- A hidden message div revealed on form submission

Used by: `actions.test.ts` (click, type), `api.test.ts` (navigate, observe, extract, screenshot), `snapshot.test.ts`, `enhancements.test.ts`

### table-data.html

A product catalog page with:
- Category dropdown (`<select>` with four options)
- HTML table with three product rows (name, price, category, stock)
- Disabled pagination buttons

Used by: `actions.test.ts` (select), `api.test.ts` (act/select), `content.test.ts` (structured extraction), `snapshot.test.ts`, `enhancements.test.ts`

### search-results.html

A search results page with:
- Search input pre-filled with "headless browser"
- Three search result entries with titles, URLs, and descriptions
- Pagination links

Used by: `content.test.ts` (text/markdown extraction), `snapshot.test.ts`

### complex-spa.html

A dashboard-style single-page application with:
- Navigation bar with links and search input
- Alert notification with dismiss button
- Tab interface (Overview, Analytics, Reports)
- Content cards with headings and action buttons
- Scrollable list with 10 items
- Modal dialog for deploy confirmation

Used by: `actions.test.ts` (scroll), `snapshot.test.ts`

---

## Container and CI Limitations

### Memory constraints

Browser renderer processes require significant memory. In containers with limited memory (under 512MB), Chromium and Firefox may crash during heavy interactions like click and type.

Set the `SKIP_HEAVY_BROWSER_TESTS` environment variable to skip tests that are known to fail in constrained environments:

```bash
SKIP_HEAVY_BROWSER_TESTS=1 npm test
```

This skips the `executeClick` and `executeType` test suites and any individual tests marked with `it.skipIf(SKIP_HEAVY)`.

### Custom browser path

If the browser binary is installed in a non-standard location (common in Docker or custom CI setups), set the `STEER_EXECUTABLE_PATH` environment variable:

```bash
STEER_EXECUTABLE_PATH=/usr/bin/firefox npm test
```

### Selecting a browser

By default, tests run with Firefox. To test with a different browser:

```bash
STEER_BROWSER=chromium npm test
STEER_BROWSER=webkit npm test
```

### Network access

Integration tests use local fixture files and do not require internet access. Tests that depend on external network connections will fail in isolated CI environments.

### Sequential execution

Tests run sequentially (`fileParallelism: false`) because they share a browser instance. This prevents resource contention and race conditions but means the full test suite takes longer than parallel execution would.

---

## Test Suites Summary

### Unit tests (~72 tests)

| File | Tests | What it covers |
|------|-------|---------------|
| `config.test.ts` | 19 | Config object shape, default values, type validation |
| `errors.test.ts` | 11 | Error classes, HTTP status codes, error codes, inheritance |
| `sanitize.test.ts` | 32 | URL blocking (javascript:, data:, file:), selector validation, text truncation |
| `resolve.test.ts` | 8 | Retry logic, transient vs. permanent error detection, backoff |
| `cli.test.ts` | 2 | CLI --help and -h flag output |

### Integration tests

| File | Tests | What it covers |
|------|-------|---------------|
| `api.test.ts` | 15 | Full REST API: health, session CRUD, navigate, observe, extract, act, screenshot, error handling |
| `actions.test.ts` | ~12 | Direct action execution: click, type, select, scroll, action dispatcher |
| `snapshot.test.ts` | ~22 | DOM snapshot on all fixtures, ref stamping, formatSnapshot output |
| `content.test.ts` | ~18 | Text extraction (Readability), markdown extraction (Turndown), structured extraction (schema), maxLength, scoping |
| `enhancements.test.ts` | ~23 | Observe verbosity levels, scoped observe, maxRefs pagination, action validation, session TTL, combined options |
