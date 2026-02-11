# Test Suite

Overview of steer's test suite.

For the full testing guide (writing tests, templates, CI limitations), see [TESTING.md](../TESTING.md).

---

## Directory Structure

```
test/
├── unit/                        # No browser required (~72 tests)
│   ├── config.test.ts           # Config object defaults and type validation
│   ├── errors.test.ts           # Error class hierarchy (6 error types)
│   ├── sanitize.test.ts         # URL, CSS selector, and text sanitization
│   ├── resolve.test.ts          # Retry logic and transient error classification
│   └── cli.test.ts              # CLI help output (--help, -h)
│
├── integration/                 # Launches a real browser
│   ├── api.test.ts              # Full REST API lifecycle via Fastify inject()
│   ├── actions.test.ts          # Direct action functions (click, type, select, scroll)
│   ├── snapshot.test.ts         # DOM snapshot, ref stamping, formatSnapshot
│   ├── content.test.ts          # Content extraction (text, markdown, structured)
│   └── enhancements.test.ts     # Observe options, session TTL, action validation
│
└── fixtures/                    # Static HTML pages for integration tests
    ├── login-form.html          # Login form with inputs, checkbox, links
    ├── table-data.html          # Product catalog with table and select dropdown
    ├── search-results.html      # Search results with links and pagination
    └── complex-spa.html         # Dashboard with tabs, alerts, scroll areas
```

---

## Quick Reference

```bash
npm test                              # All tests
npm test -- test/unit/                # Unit tests only (fast, no browser)
npm test -- test/integration/         # Integration tests (launches browser)
npm run test:watch                    # Watch mode
npm run test:coverage                 # Coverage report
npm run test:ui                       # Visual UI mode
SKIP_HEAVY_BROWSER_TESTS=1 npm test   # Skip tests that OOM in low-memory CI
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `STEER_LOG_LEVEL=silent` | Suppress log output during tests |
| `STEER_BROWSER` | Browser engine: `firefox` (default), `chromium`, `webkit` |
| `STEER_EXECUTABLE_PATH` | Custom browser binary path |
| `SKIP_HEAVY_BROWSER_TESTS=1` | Skip heavy click/type tests |
