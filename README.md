# abbwak

**API-Based Browser Without API Key** — A free, open-source headless browser designed for AI agents.

No API keys. No paid services. Just a powerful, self-hosted browser that agents can control via REST API or MCP.

## Why abbwak?

Existing browser tools for agents (Browserbase, Steel Cloud, Bright Data) charge per session or require API keys. Playwright MCP dumps 26+ tools and full accessibility trees, burning agent context windows. abbwak gives you:

- **5 clean endpoints** — `navigate`, `act`, `extract`, `observe`, `screenshot`
- **10 actions** — click, type, select, scroll, wait, keyboard, hover, upload, dialog
- **93% context reduction** — Snapshot+Refs filters DOM to only interactive/meaningful elements
- **Two interfaces** — REST API for any language, MCP server for Claude Desktop/Cursor
- **Zero cost** — runs entirely on your own machine
- **Low memory** — defaults to Firefox (~120MB idle vs Chromium's ~250MB)

---

## Quick Start

### Option 1: npm

```bash
npm install
npx playwright install firefox

# Start REST API server
npm run dev

# Or start MCP server (stdio)
npm run mcp:dev
```

### Option 2: Docker (recommended for production)

```bash
docker compose up
# Server running at http://localhost:3000
```

### Option 3: Global install

```bash
npm install -g abbwak
npx playwright install firefox

abbwak              # REST API on http://0.0.0.0:3000
abbwak --mcp        # MCP server (stdio transport)
abbwak --help       # Show all options
```

---

## MCP Setup (Claude Desktop / Claude Code)

### Claude Desktop (local npm)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "abbwak": {
      "command": "npx",
      "args": ["abbwak", "--mcp"]
    }
  }
}
```

### Claude Desktop (Docker)

Start the MCP server as a Docker container, then connect via HTTP:

```bash
docker compose up -d abbwak-mcp
# MCP server listening at http://localhost:3001/mcp
```

```json
{
  "mcpServers": {
    "abbwak": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

This uses the MCP Streamable HTTP transport — the container runs as a long-lived service and Claude Desktop connects over HTTP. No stdio pipe needed.

Without Docker Compose:

```bash
docker build -t abbwak .
docker run -d -p 3001:3001 --name abbwak-mcp abbwak node dist/cli.js --mcp-http
```

### Claude Code (local npm)

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "abbwak": {
      "command": "npx",
      "args": ["abbwak", "--mcp"]
    }
  }
}
```

### Claude Code (Docker)

```json
{
  "mcpServers": {
    "abbwak": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Go to a URL, returns page snapshot with ref IDs |
| `browser_act` | Perform actions: click, type, select, scroll, wait, keyboard, hover, upload, dialog |
| `browser_extract` | Get page content as text, markdown, or structured JSON |
| `browser_observe` | Get accessibility snapshot with interactive element refs |
| `browser_screenshot` | Capture page as base64 PNG |

All tools accept an optional `sessionId`. If omitted, a default session is auto-created and reused.

### Example Agent Interaction

```
User: "Search for the latest Claude API docs"

Agent: browser_navigate({ url: "https://google.com" })
  → Returns snapshot: r3=textbox "Search", r5=button "Google Search"

Agent: browser_act({ action: "type", ref: "r3", value: "Claude API documentation" })
Agent: browser_act({ action: "keyboard", key: "Enter" })
  → Page navigates to search results

Agent: browser_act({ action: "wait", selector: "#search", state: "visible" })
  → Waits for results to load

Agent: browser_extract({ mode: "markdown" })
  → Returns search results as clean markdown
```

---

## REST API Reference

Base URL: `http://localhost:3000`

### Sessions

#### Create Session

```
POST /sessions
```

**Request body** (all fields optional):

```json
{
  "profile": "my-profile",
  "viewport": { "width": 1920, "height": 1080 },
  "blockResources": ["image", "font", "media"]
}
```

**Response** (201):

```json
{
  "id": "abc123xyz",
  "url": "about:blank",
  "createdAt": 1707350400000
}
```

#### List Sessions

```
GET /sessions
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "abc123xyz",
      "url": "https://example.com",
      "createdAt": 1707350400000,
      "lastActivity": 1707350450000
    }
  ]
}
```

#### Delete Session

```
DELETE /sessions/:id
```

**Response:**

```json
{ "success": true }
```

---

### Navigate

```
POST /sessions/:id/navigate
```

**Request body:**

```json
{
  "url": "https://example.com",
  "waitUntil": "domcontentloaded"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to (must be http/https) |
| `waitUntil` | string | No | `"load"`, `"domcontentloaded"`, or `"networkidle"` |

**Response:**

```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "snapshot": {
    "url": "https://example.com",
    "title": "Example Domain",
    "refs": [
      { "ref": "r1", "role": "heading", "name": "Example Domain" },
      { "ref": "r2", "role": "link", "name": "More information..." }
    ]
  }
}
```

---

### Act (Perform Actions)

```
POST /sessions/:id/act
```

**Common fields:**

| Field | Type | Required | Used by |
|-------|------|----------|---------|
| `action` | string | Yes | All |
| `ref` | string | No | click, type, select, hover, upload |
| `selector` | string | No | click, type, select, hover, upload, wait |

**Action-specific fields:**

| Action | Extra fields | Description |
|--------|-------------|-------------|
| `click` | — | Click an element by ref or selector |
| `type` | `value` (required) | Type text into input/textarea/contenteditable |
| `select` | `value` (required) | Select dropdown option (native or custom) |
| `scroll` | `direction` (up/down/left/right) | Scroll page by 500px or element into view |
| `wait` | `selector`, `state`, `timeout` | Wait for element state or network idle |
| `keyboard` | `key` (required) | Press a keyboard key or combo |
| `hover` | — | Hover over element (triggers menus/tooltips) |
| `upload` | `filePaths` (required) | Upload files to a file input |
| `dialog` | `dialogAction`, `promptText` | Configure how next dialog is handled |

**Keyboard action — allowed keys:**

- Named: `Enter`, `Escape`, `Tab`, `Backspace`, `Delete`, `Space`
- Arrows: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
- Navigation: `Home`, `End`, `PageUp`, `PageDown`
- Function: `F1` through `F12`
- Modifiers: `Control+a`, `Shift+Tab`, `Alt+F4`, `Meta+c`
- Any single printable ASCII character

**Wait action — states:**

| State | Meaning |
|-------|---------|
| `visible` | Element exists and is visible (default) |
| `hidden` | Element is hidden or removed |
| `attached` | Element exists in DOM (may be hidden) |
| `detached` | Element removed from DOM |

Timeout: default 5000ms, max 30000ms. If no selector given, waits for network idle.

**Dialog action:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dialogAction` | `"accept"` or `"dismiss"` | `"accept"` | How to handle alert/confirm/prompt |
| `promptText` | string | — | Text to enter in prompt dialogs |

**Examples:**

```bash
# Click
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r5" }'

# Type
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r3", "value": "hello world" }'

# Select dropdown
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "select", "ref": "r7", "value": "option2" }'

# Scroll
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "scroll", "direction": "down" }'

# Wait for element
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": "#results", "state": "visible", "timeout": 10000 }'

# Press keyboard key
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Enter" }'

# Keyboard combo
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Control+a" }'

# Hover (for dropdown menus)
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "hover", "ref": "r4" }'

# Upload file
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "upload", "ref": "r8", "filePaths": ["/path/to/file.pdf"] }'

# Configure dialog handling
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "dialog", "dialogAction": "accept", "promptText": "yes" }'
```

**Response** (all actions return the same shape):

```json
{
  "success": true,
  "snapshot": { "url": "...", "title": "...", "refs": [...] },
  "url": "https://example.com/page"
}
```

---

### Extract

```
POST /sessions/:id/extract
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | Yes | `"text"`, `"markdown"`, or `"structured"` |
| `selector` | string | No | CSS selector to scope extraction |
| `schema` | object | For structured | JSON schema for structured extraction |
| `maxLength` | number | No | Max characters returned (default: 4000) |

**Modes:**

| Mode | Engine | Best for |
|------|--------|----------|
| `text` | Mozilla Readability | Articles, blog posts, clean text |
| `markdown` | Turndown | Preserving structure (headings, links, lists) |
| `structured` | Custom heuristics | Extracting data (products, search results, tables) |

**Structured extraction** uses smart heuristics:
- Array schema → finds repeated elements, extracts properties per item
- Object schema → extracts single object from scoped element
- Property names like `url`, `href`, `image`, `src` auto-read from element attributes
- Type coercion: string, number, integer, boolean

**Examples:**

```bash
# Plain text
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "text" }'

# Markdown from specific section
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "markdown", "selector": "main" }'

# Structured data
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "structured",
    "selector": ".product-list",
    "schema": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "price": { "type": "number" },
          "url": { "type": "string" }
        }
      }
    }
  }'
```

**Response:**

```json
{
  "content": "Extracted text or markdown or structured data...",
  "url": "https://example.com",
  "title": "Example"
}
```

---

### Observe

```
GET /sessions/:id/observe
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `scope` | string | — | CSS selector to restrict snapshot (`"#main"`, `"form.login"`) |
| `verbosity` | string | `"normal"` | `"minimal"`, `"normal"`, or `"detailed"` |
| `maxRefs` | number | — | Limit number of returned elements |

**Verbosity levels:**

| Level | Fields included |
|-------|----------------|
| `minimal` | ref, role, name |
| `normal` | + value, checked, disabled, expanded, options |
| `detailed` | + descriptions |

**Response:**

```json
{
  "url": "https://example.com",
  "title": "Example",
  "refs": [
    { "ref": "r1", "role": "link", "name": "Home" },
    { "ref": "r2", "role": "textbox", "name": "Search", "value": "" },
    { "ref": "r3", "role": "button", "name": "Submit", "disabled": false }
  ]
}
```

---

### Screenshot

```
GET /sessions/:id/screenshot
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `fullPage` | boolean | `false` | Capture full scrollable page |
| `quality` | number | `50` | JPEG quality (1-100) |

**Response:** Binary JPEG image (`Content-Type: image/jpeg`)

```bash
curl http://localhost:3000/sessions/$ID/screenshot > page.jpg
curl "http://localhost:3000/sessions/$ID/screenshot?fullPage=true&quality=90" > full.jpg
```

> **Note:** The REST API returns JPEG (configurable quality). The MCP tool returns base64 PNG.

---

### Health

```
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "sessions": 2,
  "config": {
    "maxSessions": 10,
    "sessionTimeoutMs": 300000,
    "requestTimeoutMs": 30000
  }
}
```

---

## How Snapshot+Refs Works

Instead of dumping the full accessibility tree (thousands of nodes), abbwak:

1. Walks the DOM and finds **interactive elements** (links, buttons, inputs, selects, contenteditable) plus **structural elements** (headings, landmarks, alerts)
2. Filters out hidden elements (`display:none`, `visibility:hidden`, `opacity:0`, `aria-hidden`)
3. Computes accessible names via ARIA labels, `<label>`, `alt`, `title`, `placeholder`, `textContent`
4. Stamps each element with a stable `data-abbwak-ref` attribute (`r1`, `r2`, ...)
5. Returns a compact list of `{ ref, role, name, value?, checked?, disabled?, options? }`
6. Agents use ref IDs to target elements in subsequent `act` calls

This typically reduces context by **~93%** compared to raw accessibility trees, saving tokens and improving agent reasoning.

### Elements captured

**Interactive:** `a[href]`, `button`, `input`, `textarea`, `select`, `[contenteditable]`, ARIA roles (`button`, `link`, `checkbox`, `radio`, `tab`, `menuitem`, `switch`, `slider`, `combobox`, `option`, `spinbutton`, `searchbox`, `treeitem`)

**Structural:** `h1`-`h6`, `[role=heading]`, `[role=alert]`, `[role=alertdialog]`, `[role=status]`, `[role=dialog]`, `img[alt]`, `[aria-live]`, landmark roles

---

## Configuration

All configuration via environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ABBWAK_PORT` | int | `3000` | HTTP server port |
| `ABBWAK_HOST` | string | `0.0.0.0` | HTTP server bind address |
| `ABBWAK_MAX_SESSIONS` | int | `10` | Maximum concurrent browser sessions |
| `ABBWAK_SESSION_TIMEOUT_MS` | int | `300000` | Session idle timeout in ms (5 min) |
| `ABBWAK_REQUEST_TIMEOUT_MS` | int | `30000` | HTTP request timeout in ms (30s) |
| `ABBWAK_HEADLESS` | bool | `true` | Run browser in headless mode |
| `ABBWAK_BROWSER` | string | `firefox` | Browser engine: `chromium`, `firefox`, `webkit` |
| `ABBWAK_ALLOWED_DOMAINS` | string | (empty) | Comma-separated domain allowlist (empty = all) |
| `ABBWAK_BLOCK_RESOURCES` | string | `image,font,media` | Comma-separated resource types to block |
| `ABBWAK_VIEWPORT_WIDTH` | int | `1280` | Default viewport width |
| `ABBWAK_VIEWPORT_HEIGHT` | int | `720` | Default viewport height |
| `ABBWAK_EXECUTABLE_PATH` | string | (auto) | Custom browser executable path |
| `ABBWAK_MCP_PORT` | int | `3001` | MCP HTTP server port |
| `ABBWAK_LOG_LEVEL` | string | `info` | Log level: `silent`, `debug`, `info`, `warn`, `error` |

---

## Docker

### Build and run

```bash
docker build -t abbwak .

# REST API server
docker run -p 3000:3000 abbwak

# MCP server (HTTP transport)
docker run -d -p 3001:3001 abbwak node dist/cli.js --mcp-http
```

### Docker Compose

```bash
# REST API server (default)
docker compose up abbwak         # Start REST API on port 3000
docker compose up -d abbwak      # Start detached

# MCP server (HTTP transport)
docker compose up abbwak-mcp     # Start MCP on port 3001
docker compose up -d abbwak-mcp  # Start detached

# Both services
docker compose up -d             # Start everything

docker compose down              # Stop all
```

The `docker-compose.yml` includes two services:
- **`abbwak`** — REST API server on port 3000
- **`abbwak-mcp`** — MCP server on port 3001 (Streamable HTTP transport)

### Connecting Claude Desktop to Docker MCP

1. Start the MCP container:
   ```bash
   docker compose up -d abbwak-mcp
   ```

2. Add to Claude Desktop config (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "abbwak": {
         "url": "http://localhost:3001/mcp"
       }
     }
   }
   ```

3. Restart Claude Desktop — abbwak tools will appear automatically.

### MCP Transport Modes

abbwak supports two MCP transport modes:

| Mode | Flag | Use case |
|------|------|----------|
| **stdio** | `--mcp` | Local: Claude Desktop launches the process directly |
| **HTTP** | `--mcp-http` | Remote/Docker: long-lived server, clients connect via HTTP |

The HTTP transport uses the MCP [Streamable HTTP](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/#streamable-http) protocol. It supports multiple concurrent client sessions, each with their own browser sessions.

### Image details

- Base: `mcr.microsoft.com/playwright:v1.56.1-noble`
- Browser: Firefox only (~400MB lighter than all browsers)
- Memory: 2GB limit, 512MB reservation
- Healthcheck: `GET /health` every 30s
- Multi-stage build: TypeScript compiled in builder stage, only dist/ copied to production

---

## Error Handling

All errors follow a consistent JSON format:

```json
{
  "error": {
    "code": "ACTION_FAILED",
    "message": "Element ref \"r99\" not found in current snapshot",
    "statusCode": 400
  }
}
```

| Error Code | HTTP Status | When |
|------------|-------------|------|
| `SESSION_NOT_FOUND` | 404 | Session ID doesn't exist |
| `SESSION_LIMIT_REACHED` | 429 | Max concurrent sessions exceeded |
| `NAVIGATION_FAILED` | 502 | Page failed to load |
| `ACTION_FAILED` | 400 | Action execution failed |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `DOMAIN_NOT_ALLOWED` | 403 | URL blocked by domain allowlist |

---

## Security

- **URL sanitization:** Blocks `javascript:`, `data:`, `file:`, `vbscript:` protocols; only `http`/`https` allowed
- **Domain allowlist:** `ABBWAK_ALLOWED_DOMAINS` restricts which domains can be navigated to
- **Selector sanitization:** CSS selectors validated against injection patterns
- **Keyboard validation:** Only whitelisted keys and modifier combos allowed
- **Rate limiting:** 100 requests/minute per IP
- **CORS:** Configurable origin (default: permissive)
- **Resource blocking:** Images, fonts, media blocked by default
- **Session isolation:** Each session has its own BrowserContext (separate cookies, storage, cache)
- **No downloads:** `acceptDownloads: false` on all contexts
- **Request timeout:** 30s default, returns 504 Gateway Timeout on expiry

---

## Testing

```bash
npm test                              # All tests
npm test -- test/unit/                # Unit tests only (72 tests)
npm test -- test/integration/         # Integration tests (browser required)
SKIP_HEAVY_BROWSER_TESTS=1 npm test   # Skip click/type tests (low-memory CI)
```

### Test fixtures

| Fixture | Tests |
|---------|-------|
| `login-form.html` | click, type, select, checkbox interactions |
| `table-data.html` | Structured data extraction |
| `search-results.html` | Text/markdown extraction |
| `complex-spa.html` | Scroll, wait, dynamic content |

---

## Building from Source

```bash
npm install                          # Install dependencies
npm run build                        # Compile to dist/ (ESM + DTS)
npm run typecheck                    # TypeScript type checking
npm run lint                         # Biome linter
npm run lint:fix                     # Auto-fix lint issues
```

Build output:
- `dist/index.js` — REST API server
- `dist/cli.js` — CLI binary
- `dist/mcp/server.js` — MCP server
- `dist/*.d.ts` — TypeScript type declarations

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical deep-dive.

See [ROADMAP.md](ROADMAP.md) for planned features.

## License

MIT
