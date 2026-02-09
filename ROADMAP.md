# Roadmap

## Current: v1.2.0 (Shipped)

### Endpoints
- [x] `POST /sessions` — create session
- [x] `GET /sessions` — list sessions
- [x] `DELETE /sessions/:id` — destroy session
- [x] `POST /sessions/:id/navigate` — navigate to URL
- [x] `POST /sessions/:id/act` — perform actions
- [x] `POST /sessions/:id/extract` — extract content
- [x] `GET /sessions/:id/observe` — accessibility snapshot
- [x] `GET /sessions/:id/screenshot` — capture page
- [x] `GET /health` — health check

### Actions
- [x] click — click elements (force fallback)
- [x] type — fill inputs/textareas/contenteditable
- [x] select — native and custom dropdowns
- [x] scroll — directional or element-into-view
- [x] navigate — URL-validated page navigation
- [x] wait — selector state or network idle
- [x] keyboard — validated key presses and combos
- [x] hover — trigger menus/tooltips
- [x] upload — file input support
- [x] dialog — auto-handle alerts/confirms/prompts

### Infrastructure
- [x] REST API (Fastify 5)
- [x] MCP server (stdio transport)
- [x] CLI (`steer`, `steer --mcp`, `steer --help`)
- [x] Docker multi-stage build (Firefox-only, ~400MB lighter)
- [x] docker-compose with memory limits
- [x] Firefox as default browser (lower memory)
- [x] 72 unit tests, 15+ integration tests
- [x] Snapshot+Refs system (93% context reduction)
- [x] 3 extraction modes (text/markdown/structured)
- [x] Observe verbosity levels + scope + maxRefs
- [x] Security: URL/selector/key sanitization, rate limiting, CORS
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [x] Session auto-cleanup (30s interval, 5min idle timeout)

---

## v1.3.0 — Browser Power User

### `browser_evaluate` — JavaScript execution escape hatch
**Priority: HIGH**

Run arbitrary JavaScript in the page context. This is the single most requested missing feature.

```json
{ "action": "evaluate", "script": "document.title", "returnValue": true }
```

- Sandboxed: script runs in page context, not Node
- Return value serialized as JSON
- Timeout: 5s default, configurable
- Use case: edge cases no predefined action covers

### Tab management
**Priority: HIGH**

Agents hitting OAuth flows, popups, or multi-step workflows need multiple tabs.

```json
POST /sessions/:id/tabs
{ "action": "list" | "switch" | "close" | "new", "tabIndex": 0 }
```

- `list` — return all open tabs with URLs
- `switch` — switch to tab by index
- `close` — close tab by index
- `new` — open new blank tab

### Iframe support
**Priority: MEDIUM**

Many real-world sites use iframes (OAuth, embedded widgets, payment forms).

```json
{ "action": "frame", "selector": "iframe#payment" }
{ "action": "frame", "parent": true }
```

- Switch into iframe by selector
- Switch back to parent frame
- Observe/act within iframe context

---

## v1.4.0 — Persistence & Auth

### Cookie/storage access
**Priority: HIGH**

Agents need to persist auth state across sessions.

```
GET /sessions/:id/cookies
POST /sessions/:id/cookies    { cookies: [...] }
DELETE /sessions/:id/cookies
GET /sessions/:id/storage     { type: "local" | "session" }
POST /sessions/:id/storage    { type: "local", data: {...} }
```

- Export/import cookies for session persistence
- Access localStorage/sessionStorage
- Enable agents to "remember" login state

### Browser profiles
**Priority: MEDIUM**

Persistent browser profiles that survive session restarts.

```json
POST /sessions { "profile": "my-agent", "persistent": true }
```

- Profile stored on disk (cookies, storage, cache)
- Reuse across sessions
- Support for multiple profiles (different accounts)

### Auth helper
**Priority: LOW**

Common auth patterns as a single action.

```json
{ "action": "auth", "type": "basic", "username": "...", "password": "..." }
{ "action": "auth", "type": "bearer", "token": "..." }
```

- Set HTTP auth headers
- Set bearer tokens
- Inject cookies from auth response

---

## v1.5.0 — Network & Performance

### Network interception
**Priority: MEDIUM**

Capture and mock network requests.

```
POST /sessions/:id/network/intercept
{ "pattern": "**/api/*", "action": "mock", "response": { "status": 200, "body": {...} } }

GET /sessions/:id/network/log
```

- Mock API responses for testing
- Capture request/response log
- Block specific URLs (beyond resource types)

### Performance metrics
**Priority: LOW**

Expose page performance data for agents making optimization decisions.

```
GET /sessions/:id/performance
```

- Page load timing
- Resource count and sizes
- DOM node count
- Memory usage

### WebSocket support
**Priority: LOW**

Replace HTTP polling with WebSocket for real-time updates.

```
ws://localhost:3000/sessions/:id/ws
```

- Stream page events (navigation, dialog, console)
- Push snapshot updates on DOM changes
- Reduce latency for interactive agent loops

---

## v2.0.0 — Multi-Agent & Scale

### Connection pooling
**Priority: HIGH**

Pre-warm browser contexts for faster session creation.

- Pool of N ready contexts
- Session creation becomes instant (no browser launch wait)
- Configurable pool size

### Cluster mode
**Priority: MEDIUM**

Run multiple browser instances for high-throughput.

- Node.js cluster with worker processes
- Each worker owns a BrowserEngine
- Load balancer distributes sessions
- Shared session registry (Redis-backed)

### Agent SDK
**Priority: MEDIUM**

TypeScript SDK for building agents on top of steer.

```typescript
import { AbbwakClient } from "steer/client";

const browser = new AbbwakClient("http://localhost:3000");
const session = await browser.createSession();
await session.navigate("https://example.com");
const results = await session.observe({ verbosity: "minimal" });
await session.act({ action: "click", ref: results.refs[0].ref });
const content = await session.extract({ mode: "markdown" });
```

### OpenAPI spec
**Priority: LOW**

Auto-generated OpenAPI 3.1 spec from Fastify schemas.

- Swagger UI at `/docs`
- Client generation for Python, Go, Rust
- Schema validation in CI

---

## Not Planned (Out of Scope)

These are explicitly out of scope to keep steer focused:

| Feature | Why not |
|---------|---------|
| **Visual AI (GPT-4V integration)** | steer provides the browser, not the AI. Agents bring their own model. |
| **Recording/replay** | Use Playwright's codegen directly. steer is API-first. |
| **Browser extension** | Focus is headless server, not browser extension. |
| **SaaS/hosted version** | steer is self-hosted by design. No cloud service planned. |
| **Non-Playwright backends** | Puppeteer, Selenium, etc. Playwright covers all browsers. |
| **Built-in proxy** | Use container networking or external proxy. |
| **PDF rendering** | Use browser print-to-PDF via evaluate, or external tools. |

---

## Missing Today (Honest Assessment)

Things that a production agent deployment would need that we don't have yet:

### Critical gaps
1. **No `evaluate`** — no JS escape hatch for edge cases. Agents get stuck when no action fits.
2. **No tab management** — OAuth popups, new-window links break the single-page model.
3. **No cookie export/import** — agents can't persist login state between sessions.

### Important gaps
4. **No iframe support** — payment forms, OAuth frames, embedded widgets are invisible.
5. **No network log** — agents can't see API responses or debug failed requests.
6. **No connection pooling** — session creation takes 1-3s (browser context startup).

### Nice-to-have gaps
7. **No OpenAPI spec** — harder for teams to discover and integrate.
8. **No client SDK** — every consumer writes their own HTTP client.
9. **No WebSocket streaming** — agents poll instead of subscribing to events.
10. **No LICENSE file** — stated MIT but no actual LICENSE file in repo.

### Test gaps
11. **No tests for new actions** — wait, keyboard, hover, upload, dialog have no dedicated tests.
12. **No load testing** — unknown behavior at 10 concurrent sessions.
13. **No cross-browser CI** — only tested with Firefox/Chromium, not WebKit.
