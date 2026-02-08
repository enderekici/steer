# CLAUDE.md

Project instructions for AI assistants working on abbwak.

## What is abbwak?

A self-hosted headless browser for AI agents. Two interfaces: REST API (Fastify) and MCP server (stdio). Agents navigate pages, observe interactive elements via ref IDs, perform actions, and extract content — all without API keys.

## Quick Reference

```bash
npm run dev          # Start REST API (tsx, dev mode)
npm run mcp:dev      # Start MCP server (tsx, dev mode)
npm run build        # Build to dist/ (tsup, ESM + DTS)
npm start            # Start REST API (production, from dist/)
npm run mcp          # Start MCP server (production, from dist/)
npm test             # Run all tests (vitest)
npm run typecheck    # TypeScript type checking
npm run lint         # Biome linter
npm run lint:fix     # Auto-fix lint issues
```

## Project Structure

```
src/
├── index.ts              # REST API entry point
├── cli.ts                # CLI (abbwak [--mcp] [--help])
├── config.ts             # Env-based config (all ABBWAK_* vars)
├── browser/
│   ├── engine.ts         # BrowserEngine singleton (launch/close)
│   ├── session.ts        # Session class (context, page, refs)
│   └── session-manager.ts # CRUD, cleanup timer, session limits
├── actions/
│   ├── index.ts          # Dispatcher: executeAction() switch
│   ├── types.ts          # ActionTarget, ActionResult
│   ├── resolve.ts        # resolveElement() + withRetry()
│   ├── click.ts          # Click with force fallback
│   ├── type.ts           # Type with fill/triple-click fallback
│   ├── select.ts         # Native <select> + custom dropdown
│   ├── scroll.ts         # Directional scroll or element-into-view
│   ├── navigate.ts       # URL validation + page.goto()
│   ├── wait.ts           # Wait for selector state or networkidle
│   ├── keyboard.ts       # Validated key press
│   ├── hover.ts          # Hover + 300ms settle
│   ├── upload.ts         # File input setInputFiles()
│   └── dialog.ts         # Dialog auto-handler (accept/dismiss)
├── processing/
│   ├── snapshot.ts       # DOM walker, ref stamping, accessibility snapshot
│   └── content.ts        # Text (Readability), markdown (Turndown), structured extraction
├── server/
│   ├── app.ts            # Fastify builder
│   ├── routes/           # sessions, navigate, act, extract, observe, screenshot
│   └── middleware/        # error-handler, security (CORS+rate-limit), request-timeout
├── mcp/
│   ├── server.ts         # MCP server (stdio, tool handlers)
│   └── tools.ts          # MCP tool definitions (JSON schema)
└── utils/
    ├── errors.ts         # AppError hierarchy (6 error types)
    ├── logger.ts         # pino (JSON prod, pretty dev)
    └── sanitize.ts       # URL, selector, text sanitization
```

## Critical Bug: __name in page.evaluate()

When using `npx tsx`, the transpiler injects `__name` decorators on named function declarations. Functions inside Playwright's `page.evaluate()` run in the browser context where `__name` doesn't exist, causing `ReferenceError: __name is not defined`.

**Fix:** Use arrow function expressions inside `page.evaluate()`:
```typescript
// BAD — will crash in browser context
await page.evaluate(() => {
  function helper() { ... }  // tsx wraps this with __name()
});

// GOOD
await page.evaluate(() => {
  const helper = () => { ... };  // arrow functions are safe
});
```

A global `__name` shim is also injected via `addInitScript()` in `session.ts:79` as a safety net.

## Testing

```bash
npm test                              # All tests
npm test -- test/unit/                # Unit tests only (72 tests, no browser)
npm test -- test/integration/         # Integration tests (launches browser)
SKIP_HEAVY_BROWSER_TESTS=1 npm test   # Skip click/type (OOM in low-memory CI)
```

**Test config:** `vitest.config.ts`
- `testTimeout: 30000` (30s per test)
- `hookTimeout: 30000` (30s for beforeAll/afterAll)
- `fileParallelism: false` (tests run sequentially — browser is shared)
- Coverage provider: v8

**Test fixtures:** `test/fixtures/*.html` — local HTML files served via Node HTTP server on random port.

**Container limitations:**
- No internet access (network-dependent tests will fail)
- Chromium/Firefox crash under heavy load (click/type tests timeout)
- Use `SKIP_HEAVY_BROWSER_TESTS=1` to skip flaky browser action tests
- Use `ABBWAK_EXECUTABLE_PATH` env var if browser binary is in a non-standard location

## Code Style

- **Linter:** Biome (`biome.json`)
- **Indent:** 2 spaces
- **Quotes:** Single quotes (configured in biome, but codebase uses double — follow existing file convention)
- **Semicolons:** Always
- **Line width:** 100
- **Imports:** Auto-organized by Biome
- **No unused imports:** Warned

## Adding a New Action

1. Create `src/actions/myaction.ts` following the pattern:
   - Import `Session`, `ActionTarget`, `ActionResult`, `ActionError`, `takeSnapshot`
   - Export `async function executeMyAction(session, ...): Promise<ActionResult>`
   - Call action logic
   - Take fresh snapshot: `const { snapshot, refMap } = await takeSnapshot(session.page)`
   - Update refs: clear + re-populate from refMap
   - Call `session.touch()`
   - Return `{ success: true, snapshot, url: session.page.url() }`

2. Register in `src/actions/index.ts`:
   - Add import and re-export
   - Add case to `executeAction()` switch
   - Add any new params to `ActionParams` interface

3. Update `src/server/routes/act.ts`:
   - Add to `ActBody` interface
   - Add to JSON schema `enum` for `action`
   - Add any new body properties to schema
   - Pass new params in route handler

4. Update `src/mcp/tools.ts`:
   - Add action name to `browser_act` enum
   - Add any new parameters with descriptions

5. Update `src/mcp/server.ts`:
   - Pass new params in `handleAct()` → `executeAction()` call

6. Add tests in `test/integration/actions.test.ts`

## Key Patterns

**All actions return the same shape:**
```typescript
{ success: boolean, snapshot: PageSnapshot, url: string, error?: string }
```

**Element resolution:** Use `resolveElement(session, target, actionName)` from `resolve.ts`. It handles ref lookup, selector fallback, stale detection, and clear error messages.

**Retry logic:** Use `withRetry(fn, { retries: 1, actionName })` for actions that may fail transiently (timeout, detached element).

**Snapshot after action:** Every action takes a fresh snapshot and updates `session.refs`. This ensures subsequent actions have valid ref IDs.

**Error throwing:** Throw `ActionError(actionName, message)` for action failures. Throw `ValidationError(message)` for bad input. The error handler middleware handles serialization.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ABBWAK_PORT` | `3000` | Server port |
| `ABBWAK_HOST` | `0.0.0.0` | Server host |
| `ABBWAK_MAX_SESSIONS` | `10` | Max concurrent sessions |
| `ABBWAK_SESSION_TIMEOUT_MS` | `300000` | Session idle timeout (5 min) |
| `ABBWAK_REQUEST_TIMEOUT_MS` | `30000` | Request timeout (30s) |
| `ABBWAK_HEADLESS` | `true` | Headless browser |
| `ABBWAK_BROWSER` | `firefox` | Browser: chromium, firefox, webkit |
| `ABBWAK_BLOCK_RESOURCES` | `image,font,media` | Blocked resource types |
| `ABBWAK_ALLOWED_DOMAINS` | (empty) | Domain allowlist (empty = all) |
| `ABBWAK_VIEWPORT_WIDTH` | `1280` | Viewport width |
| `ABBWAK_VIEWPORT_HEIGHT` | `720` | Viewport height |
| `ABBWAK_EXECUTABLE_PATH` | (auto) | Custom browser path |
| `ABBWAK_LOG_LEVEL` | `info` | Log level |

## HTTP Routes Summary

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/health` | Health check + session count |
| `POST` | `/sessions` | Create session |
| `GET` | `/sessions` | List sessions |
| `DELETE` | `/sessions/:id` | Destroy session |
| `POST` | `/sessions/:id/navigate` | Navigate to URL |
| `POST` | `/sessions/:id/act` | Perform action (10 types) |
| `POST` | `/sessions/:id/extract` | Extract content |
| `GET` | `/sessions/:id/observe` | Accessibility snapshot |
| `GET` | `/sessions/:id/screenshot` | Capture JPEG screenshot |

## MCP Tools Summary

| Tool | Parameters |
|------|-----------|
| `browser_navigate` | `url`, `sessionId?` |
| `browser_act` | `action`, `ref?`, `selector?`, `value?`, `direction?`, `key?`, `state?`, `timeout?`, `filePaths?`, `dialogAction?`, `promptText?`, `sessionId?` |
| `browser_extract` | `mode?`, `selector?`, `schema?`, `maxLength?`, `sessionId?` |
| `browser_observe` | `scope?`, `verbosity?`, `maxRefs?`, `sessionId?` |
| `browser_screenshot` | `fullPage?`, `sessionId?` |

## Dependencies

**Runtime:** playwright, fastify, @fastify/cors, @fastify/rate-limit, @modelcontextprotocol/sdk, @mozilla/readability, linkedom, turndown, pino, pino-pretty, nanoid, zod

**Dev:** typescript, tsx, tsup, vitest, biome, @biomejs/biome, @types/node, @types/turndown

## Documentation

- `README.md` — User guide (setup, API reference, examples, config, Docker)
- `ARCHITECTURE.md` — Technical deep-dive (system diagram, algorithms, design decisions)
- `ROADMAP.md` — Planned features and known gaps
