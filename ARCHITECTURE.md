# Architecture

Technical guide for developers contributing to or deploying steer.

---

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│  AI Agent (Claude, GPT, etc.) or HTTP client (curl)  │
└──────────────┬────────────────────┬──────────────────┘
               │ REST API           │ MCP (stdio)
               ▼                    ▼
┌──────────────────────┐ ┌─────────────────────────────┐
│   Fastify Server     │ │   MCP Server                │
│   src/server/app.ts  │ │   src/mcp/server.ts         │
│                      │ │                             │
│   Routes:            │ │   Tools:                    │
│   /sessions (CRUD)   │ │   browser_navigate          │
│   /sessions/:id/     │ │   browser_act               │
│     navigate         │ │   browser_extract           │
│     act              │ │   browser_observe           │
│     extract          │ │   browser_screenshot        │
│     observe          │ │                             │
│     screenshot       │ │   Auto-session management   │
│                      │ │   (creates default session)  │
│   Middleware:         │ │                             │
│   error-handler      │ │   Transport: stdio          │
│   security (CORS+RL) │ │   (for Claude Desktop)      │
│   request-timeout    │ │                             │
└──────────┬───────────┘ └──────────┬──────────────────┘
           │                        │
           ▼                        ▼
┌──────────────────────────────────────────────────────┐
│                  Action Layer                         │
│                  src/actions/                         │
│                                                      │
│  index.ts (dispatcher) → executeAction(session, ...) │
│  ┌──────────┬──────────┬──────────┬────────────────┐ │
│  │  click   │  type    │  select  │  scroll        │ │
│  │  navigate│  wait    │  keyboard│  hover         │ │
│  │  upload  │  dialog  │          │                │ │
│  └──────────┴──────────┴──────────┴────────────────┘ │
│                                                      │
│  resolve.ts — element resolution (ref → ElementHandle)│
│  types.ts — ActionTarget, ActionResult interfaces    │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                Processing Layer                       │
│                src/processing/                        │
│                                                      │
│  snapshot.ts                    content.ts            │
│  ├─ takeSnapshot()             ├─ extractContent()   │
│  ├─ formatSnapshot()           ├─ text (Readability) │
│  ├─ DOM walker (evaluate)      ├─ markdown (Turndown)│
│  ├─ ref stamping               └─ structured (schema)│
│  └─ ElementHandle resolution                         │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                Browser Layer                          │
│                src/browser/                           │
│                                                      │
│  engine.ts          session.ts        session-mgr.ts │
│  ├─ launch()        ├─ id (nanoid)    ├─ create()    │
│  ├─ close()         ├─ context        ├─ destroy()   │
│  ├─ getBrowser()    ├─ page           ├─ list()      │
│  └─ isRunning()     ├─ refs Map       ├─ cleanup()   │
│                     ├─ touch()        └─ destroyAll() │
│                     └─ close()                        │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                Playwright                             │
│                (chromium | firefox | webkit)           │
│                                                      │
│  Browser → BrowserContext → Page → ElementHandle      │
└──────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── index.ts                    # REST API entry point (launches browser + Fastify)
├── cli.ts                      # CLI entry (--help, --mcp, default=REST)
├── config.ts                   # Environment-based configuration
│
├── browser/
│   ├── engine.ts               # BrowserEngine: launch, close, singleton
│   ├── session.ts              # Session: id, context, page, refs, lifecycle
│   └── session-manager.ts      # SessionManager: CRUD, cleanup timer, limits
│
├── actions/
│   ├── index.ts                # Action dispatcher (executeAction switch)
│   ├── types.ts                # ActionTarget, ActionResult interfaces
│   ├── resolve.ts              # resolveElement(), withRetry()
│   ├── click.ts                # executeClick — click with force fallback
│   ├── type.ts                 # executeType — fill/triple-click fallback
│   ├── select.ts               # executeSelect — native + custom dropdown
│   ├── scroll.ts               # executeScroll — direction or element
│   ├── navigate.ts             # executeNavigate — URL validation + goto
│   ├── wait.ts                 # executeWait — selector state or networkidle
│   ├── keyboard.ts             # executeKeyboard — validated key press
│   ├── hover.ts                # executeHover — hover + 300ms settle
│   ├── upload.ts               # executeUpload — setInputFiles
│   └── dialog.ts               # executeDialogConfig — dialog auto-handler
│
├── processing/
│   ├── snapshot.ts             # DOM walker, ref stamping, accessibility snapshot
│   └── content.ts              # Text/markdown/structured content extraction
│
├── server/
│   ├── app.ts                  # Fastify app builder (registers routes + middleware)
│   ├── routes/
│   │   ├── sessions.ts         # POST/GET/DELETE /sessions
│   │   ├── navigate.ts         # POST /sessions/:id/navigate
│   │   ├── act.ts              # POST /sessions/:id/act
│   │   ├── extract.ts          # POST /sessions/:id/extract
│   │   ├── observe.ts          # GET /sessions/:id/observe
│   │   └── screenshot.ts       # GET /sessions/:id/screenshot
│   └── middleware/
│       ├── error-handler.ts    # Global error → JSON response
│       ├── security.ts         # CORS + rate limiting
│       └── request-timeout.ts  # 30s timeout → 504
│
├── mcp/
│   ├── server.ts               # MCP server (stdio transport, tool handlers)
│   └── tools.ts                # MCP tool definitions (JSON schema)
│
└── utils/
    ├── errors.ts               # Error classes (AppError hierarchy)
    ├── logger.ts               # pino logger (JSON prod, pretty dev)
    └── sanitize.ts             # URL, selector, text sanitization
```

---

## Request Lifecycle

### REST API Request

```
HTTP Request
  │
  ├─ Fastify receives request
  ├─ request-timeout middleware starts 30s timer
  ├─ security middleware checks CORS + rate limit
  ├─ Fastify validates request against JSON schema
  │
  ├─ Route handler executes:
  │   ├─ sessionManager.getSession(id) — throws 404 if missing
  │   ├─ Calls action/processing function
  │   ├─ Action takes snapshot, updates session.refs
  │   ├─ session.touch() updates lastActivity
  │   └─ Returns ActionResult
  │
  ├─ onResponse hook logs request
  └─ JSON response sent
```

### MCP Request

```
stdio JSON-RPC message
  │
  ├─ MCP SDK parses tool call
  ├─ CallToolRequest handler dispatches by name
  │
  ├─ Tool handler:
  │   ├─ ensureSession() — creates default if needed
  │   ├─ Calls same action/processing functions as REST
  │   ├─ Formats result as text or image content
  │   └─ Returns MCP ToolResponse
  │
  └─ MCP SDK sends JSON-RPC response via stdio
```

---

## Session Lifecycle

```
CREATE                              ACTIVE                              EXPIRE/DESTROY
  │                                   │                                      │
  ├─ Browser.newContext()             ├─ Actions update lastActivity          ├─ Cleanup timer (30s)
  ├─ Context.newPage()               ├─ session.touch() on each call         ├─ Checks isExpired()
  ├─ Inject __name shim              ├─ refs Map updated per snapshot        ├─ context.close()
  ├─ Setup resource blocking         │                                      ├─ Remove from Map
  ├─ Generate nanoid                 │                                      │
  ├─ Store in sessions Map           │                                      │
  └─ Return Session                  │                                      │
                                     │                                      │
                              5 min idle timeout ─────────────────────────► │
```

**Key details:**
- Max sessions enforced at creation time (default: 10)
- Cleanup interval: 30 seconds
- Each session has its own BrowserContext (isolated cookies, storage, cache)
- Refs Map is rebuilt on every action (cleared → re-populated from fresh snapshot)
- `__name` shim injected via `addInitScript()` to fix tsx/esbuild compatibility

---

## Snapshot Algorithm

The core differentiator. Runs inside `page.evaluate()`:

```
1. Define interactive selectors:
   a[href], button, input, textarea, select, [contenteditable],
   [role=button|link|checkbox|radio|tab|menuitem|switch|slider|
    combobox|option|spinbutton|searchbox|treeitem]

2. Define meaningful selectors:
   h1-h6, [role=heading|alert|alertdialog|status|dialog],
   img[alt], [aria-live], landmark roles

3. Query all matching elements

4. For each element:
   a. Check visibility (display, visibility, opacity, aria-hidden)
   b. Skip if hidden
   c. Compute accessible name:
      - aria-label
      - aria-labelledby → resolve referenced element text
      - <label for="id"> → label text
      - alt (images)
      - title
      - placeholder
      - textContent (trimmed, 80 char limit)
   d. Extract role (explicit role attr or implicit from tag)
   e. Extract value, checked, disabled, expanded, options
   f. Stamp element: data-steer-ref="rN"
   g. Add to results array

5. Return to Node.js context

6. For each ref, resolve ElementHandle:
   page.$(`[data-steer-ref="rN"]`)

7. Return { snapshot: PageSnapshot, refMap: Map<string, ElementHandle> }
```

**Verbosity filtering** (applied before return):
- `minimal`: Only `ref`, `role`, `name`
- `normal`: Add `value`, `checked`, `disabled`, `expanded`, `options`
- `detailed`: Add `description`

**Scope filtering**: If `scope` CSS selector provided, only query within that element.

**maxRefs**: Slice results array to limit.

---

## Action Resolution

All ref-based actions go through `resolveElement()`:

```
resolveElement(session, target, actionName)
  │
  ├─ If target.ref:
  │   ├─ session.refs.get(ref) → ElementHandle
  │   ├─ If not found → error with available refs hint
  │   └─ Check element.isConnected (stale detection)
  │
  ├─ If target.selector:
  │   ├─ sanitizeSelector(selector)
  │   └─ page.$(selector) → ElementHandle or error
  │
  └─ Return ElementHandle
```

**Retry logic** (`withRetry()`):
- Max 1 retry
- Retries on: Timeout, "element is detached", "Target closed", "Execution context destroyed"
- 200ms pause between retries

---

## Content Extraction Pipeline

```
extractContent(page, options)
  │
  ├─ TEXT MODE:
  │   ├─ page.content() → HTML
  │   ├─ Parse with linkedom
  │   ├─ Mozilla Readability.parse()
  │   ├─ Fallback: page.innerText() if Readability fails
  │   ├─ Collapse whitespace (3+ newlines → 2)
  │   └─ truncateText(result, maxLength)
  │
  ├─ MARKDOWN MODE:
  │   ├─ page.content() → HTML (or scoped via selector)
  │   ├─ Strip noisy tags: script, style, nav, footer, header, aside
  │   ├─ Turndown.turndown(html) → markdown
  │   ├─ Collapse whitespace
  │   └─ truncateText(result, maxLength)
  │
  └─ STRUCTURED MODE:
      ├─ Determine schema type (array vs object)
      ├─ ARRAY:
      │   ├─ Find repeated parent elements via selector
      │   ├─ For each item element:
      │   │   ├─ For each schema property:
      │   │   │   ├─ Generate candidate selectors from property name
      │   │   │   │   (e.g., "price" → ".price", "[data-price]", etc.)
      │   │   │   ├─ Query for matching child element
      │   │   │   ├─ Attribute props (url/href/src) → read attribute
      │   │   │   ├─ Others → textContent
      │   │   │   └─ Type coercion (number, integer, boolean, string)
      │   │   └─ Add to results array
      │   └─ Binary-search trim to fit maxLength
      └─ OBJECT:
          ├─ Scope to selector if provided
          └─ Extract single object using same property heuristics
```

---

## Error Hierarchy

```
AppError (base)
├── statusCode: number
├── code: string
└── message: string

SessionNotFoundError extends AppError
├── statusCode: 404
└── code: SESSION_NOT_FOUND

SessionLimitError extends AppError
├── statusCode: 429
└── code: SESSION_LIMIT_REACHED

NavigationError extends AppError
├── statusCode: 502
└── code: NAVIGATION_FAILED

ActionError extends AppError
├── statusCode: 400
└── code: ACTION_FAILED

ValidationError extends AppError
├── statusCode: 400
└── code: VALIDATION_ERROR

DomainNotAllowedError extends AppError
├── statusCode: 403
└── code: DOMAIN_NOT_ALLOWED
```

The error handler middleware catches all errors and transforms them into:
```json
{ "error": { "code": "...", "message": "...", "statusCode": N } }
```

Fastify validation errors (schema mismatch) are also caught and normalized.

---

## Security Model

### Input Validation

| Layer | What's validated |
|-------|-----------------|
| **URL** | Only http/https allowed. `javascript:`, `data:`, `file:`, `vbscript:` blocked. Domain allowlist checked. |
| **CSS Selector** | Pattern-matched against safe characters. No JS expressions. |
| **Keyboard keys** | Explicit whitelist: named keys, modifier combos, printable ASCII. No arbitrary sequences. |
| **JSON body** | Fastify JSON schema validation with `additionalProperties: false`. |
| **Viewport** | Width 320-3840, height 240-2160. |
| **Timeout** | Wait action capped at 30,000ms. |

### Browser Isolation

- Each session = separate BrowserContext (cookies, storage, cache isolated)
- `acceptDownloads: false` — no file downloads
- Resource blocking (images, fonts, media) reduces attack surface and bandwidth
- Browser runs with `--no-sandbox` (required in containers) but inside Docker

### Rate Limiting

- 100 requests per minute per IP (via @fastify/rate-limit)
- Session limit: 10 concurrent (configurable)
- Request timeout: 30s (returns 504)

---

## Build System

### Development

```bash
npm run dev         # tsx src/index.ts (TypeScript, hot reload)
npm run mcp:dev     # tsx src/mcp/server.ts
```

### Production

```bash
npm run build       # tsup → dist/ (ESM + DTS)
npm start           # node dist/index.js
npm run mcp         # node dist/mcp/server.js
```

### tsup Configuration

- Entry points: `src/index.ts`, `src/cli.ts`, `src/mcp/server.ts`
- Format: ESM only
- DTS: TypeScript declarations generated
- Output: `dist/` (cleaned on each build)
- Chunk splitting: shared code extracted to `dist/chunk-*.js`

### Docker Build

Two-stage:
1. **Builder** (node:20-slim): `npm ci` + `npm run build` → produces `dist/`
2. **Production** (playwright:noble): `npm ci --omit=dev` + copy `dist/`, install Firefox only

---

## Testing Strategy

### Unit Tests (72 tests, no browser needed)

| File | Tests | What it covers |
|------|-------|---------------|
| `config.test.ts` | 19 | Config defaults, env var parsing, type validation |
| `errors.test.ts` | 11 | Error classes, codes, inheritance, serialization |
| `sanitize.test.ts` | 32 | URL blocking, selector validation, text truncation |
| `resolve.test.ts` | 8 | Retry logic, backoff, error classification |
| `cli.test.ts` | 2 | CLI --help output |

### Integration Tests (browser required)

| File | Tests | What it covers |
|------|-------|---------------|
| `api.test.ts` | 15 | Full REST API lifecycle (sessions, navigate, act, extract, screenshot) |
| `actions.test.ts` | ~12 | Direct action execution (click, type, select, scroll) |
| `enhancements.test.ts` | ~23 | Observe options (verbosity, scope, maxRefs), session TTL, validation |

### Test Infrastructure

- Framework: vitest v3
- Fixtures: local HTML files served via Node HTTP server on random port
- Browser launched per test suite (beforeAll/afterAll)
- `SKIP_HEAVY_BROWSER_TESTS=1`: skips click/type tests that OOM in low-memory containers

---

## Key Design Decisions

### Why Snapshot+Refs instead of full accessibility tree?

Full accessibility trees are 10-50x larger, burning agent context windows. The ref system:
1. Reduces tokens by ~93%
2. Gives agents stable IDs to reference elements
3. Filters to only actionable elements
4. Supports verbosity tuning for further reduction

### Why Firefox as default?

- ~30-40% less memory than Chromium at idle
- Better stability in memory-constrained containers
- Good enough web compatibility for agent tasks
- Chromium/WebKit still available via `STEER_BROWSER` config

### Why two interfaces (REST + MCP)?

- **REST API**: Works with any language, any agent framework, easy to test with curl
- **MCP**: Native integration with Claude Desktop, Cursor, and other MCP clients
- Both share the same action/processing layer — no code duplication

### Why Fastify over Express?

- ~2x faster request handling
- Built-in JSON schema validation
- Plugin architecture (clean middleware registration)
- TypeScript-first with good type inference

### Why not use Playwright's built-in accessibility tree?

Playwright's `page.accessibility.snapshot()` returns the full tree including:
- Non-interactive static text nodes
- Nested container roles
- Hidden/aria-hidden elements
- Duplicate text from parent/child relationships

steer's custom DOM walker is more selective and agent-friendly.

---

## Known Limitations

1. **Single page per session** — no tab management or iframe switching
2. **No persistent auth** — cookies/storage cleared when session closes
3. **No JavaScript evaluation** — no escape hatch for edge cases
4. **No network interception** — can't mock responses or capture requests
5. **Structured extraction is heuristic** — works well for common patterns, not guaranteed for complex layouts
6. **Container memory** — Chromium needs ~250MB+, Firefox ~120MB+. Below 512MB total, expect OOM.
7. **`__name` shim** — tsx/esbuild injects `__name` decorators that don't exist in browser context. Fixed via `addInitScript()` shim, but fragile if bundler behavior changes.
