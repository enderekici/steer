# steer — Implementation Plan

> API-Based Browser Without API Key
> A free, self-hosted headless browser for AI agents.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Core Modules](#5-core-modules)
6. [API Design](#6-api-design)
7. [Agent Interface — The 5 Primitives](#7-agent-interface--the-5-primitives)
8. [Context Efficiency — The Key Differentiator](#8-context-efficiency--the-key-differentiator)
9. [Session & State Management](#9-session--state-management)
10. [Security Model](#10-security-model)
11. [MCP Server Integration](#11-mcp-server-integration)
12. [Testing Strategy](#12-testing-strategy)
13. [Implementation Phases](#13-implementation-phases)
14. [Benchmarking & Evaluation](#14-benchmarking--evaluation)

---

## 1. Vision & Goals

### Problem
AI agents need browsers. Current options are:
- **Paid cloud services** (Browserbase, Steel Cloud, Bright Data) — cost per session, API keys required
- **Playwright MCP** — free but dumps 26+ tools and full accessibility trees, destroying agent context windows
- **Browser Use** — good but Python-only, tightly coupled to specific LLM providers

### What steer is
A **self-hosted, zero-cost, language-agnostic HTTP API** that wraps a headless browser with an agent-optimized interface. Any agent (Python, TypeScript, Rust, Go, curl) can control a real browser through a clean REST API + optional MCP server.

### Design Principles

| Principle | Meaning |
|---|---|
| **Zero cost** | No API keys, no cloud fees, no telemetry. Runs on your hardware. |
| **Minimal context** | Every response is optimized to use the fewest tokens possible. Agents get only what they need. |
| **Small tool surface** | 5 primitives, not 26. Fewer decisions = better agent performance. |
| **Language agnostic** | HTTP REST API. Works from any language, any framework, any agent. |
| **Self-healing** | Built-in retry logic, wait strategies, and error recovery. |
| **Secure by default** | Domain allowlists, sandboxed execution, no arbitrary code eval. |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Agent (any language)                  │
│            Python / TypeScript / Go / curl               │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP REST  or  MCP Protocol
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   steer Server                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  REST API    │  │  MCP Server  │  │  WebSocket     │  │
│  │  (Fastify)   │  │  (optional)  │  │  (live events) │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         └────────────────┼──────────────────┘           │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Session Manager                      │   │
│  │  • Session pool (create/reuse/destroy)            │   │
│  │  • Cookie/localStorage persistence                │   │
│  │  • Concurrent session isolation                   │   │
│  └──────────────────────┬───────────────────────────┘   │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Page Processor                        │   │
│  │  • Accessibility tree extraction                  │   │
│  │  • Interactive element filtering (Snapshot+Refs)  │   │
│  │  • Content extraction & cleaning                  │   │
│  │  • Screenshot capture (on-demand)                 │   │
│  └──────────────────────┬───────────────────────────┘   │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Action Executor                       │   │
│  │  • Click / Type / Select / Scroll / Navigate      │   │
│  │  • Smart waits (network idle, DOM stable)         │   │
│  │  • Error recovery & retry                         │   │
│  └──────────────────────┬───────────────────────────┘   │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Playwright Engine                     │   │
│  │  • Chromium (default) / Firefox / WebKit          │   │
│  │  • CDP connection                                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key architectural decisions:

1. **Playwright as the engine** — most mature headless browser automation library, supports all major browsers, actively maintained by Microsoft.
2. **Fastify as the HTTP layer** — fastest Node.js HTTP framework, schema validation built-in, plugin ecosystem.
3. **Session-based model** — agents create sessions, perform actions within sessions, sessions maintain state. This maps naturally to how agents work (multi-step tasks on the same page).
4. **Layered processing** — raw browser → page processor (filters/cleans) → API response. The processing layer is where context efficiency happens.

---

## 3. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Runtime** | Node.js 20+ | Playwright's native environment, async I/O |
| **Language** | TypeScript | Type safety, better DX, self-documenting |
| **HTTP Server** | Fastify | Fastest Node framework, JSON schema validation |
| **Browser Engine** | Playwright | Multi-browser, CDP access, best API |
| **Package Manager** | pnpm | Fast, disk-efficient |
| **Testing** | Vitest | Fast, native TypeScript, compatible API |
| **Linting** | Biome | Single tool for lint + format, fast |
| **Build** | tsup | Simple TypeScript bundling |
| **MCP SDK** | @modelcontextprotocol/sdk | Official MCP TypeScript SDK |

---

## 4. Project Structure

```
steer/
├── src/
│   ├── index.ts                  # Entry point — starts server
│   ├── config.ts                 # Configuration (env vars, defaults)
│   │
│   ├── server/
│   │   ├── app.ts                # Fastify app setup & plugins
│   │   ├── routes/
│   │   │   ├── sessions.ts       # POST/DELETE /sessions
│   │   │   ├── navigate.ts       # POST /sessions/:id/navigate
│   │   │   ├── act.ts            # POST /sessions/:id/act
│   │   │   ├── extract.ts        # POST /sessions/:id/extract
│   │   │   ├── observe.ts        # GET  /sessions/:id/observe
│   │   │   └── screenshot.ts     # GET  /sessions/:id/screenshot
│   │   └── middleware/
│   │       ├── error-handler.ts  # Consistent error responses
│   │       └── security.ts       # Domain allowlist, rate limiting
│   │
│   ├── browser/
│   │   ├── engine.ts             # Playwright lifecycle (launch/close)
│   │   ├── session.ts            # Session class (page + state)
│   │   ├── session-manager.ts    # Session pool & lifecycle
│   │   └── profiles.ts           # Persistent browser profiles
│   │
│   ├── processing/
│   │   ├── snapshot.ts           # Accessibility tree → filtered snapshot
│   │   ├── refs.ts               # Element reference system (stable IDs)
│   │   ├── content.ts            # Page content extraction & cleaning
│   │   └── screenshot.ts         # Screenshot capture & optimization
│   │
│   ├── actions/
│   │   ├── click.ts              # Click with smart targeting
│   │   ├── type.ts               # Type with field clearing
│   │   ├── select.ts             # Select/dropdown handling
│   │   ├── scroll.ts             # Scroll (directional + to element)
│   │   ├── navigate.ts           # URL navigation + wait strategies
│   │   └── wait.ts               # Smart wait utilities
│   │
│   ├── mcp/
│   │   ├── server.ts             # MCP server setup
│   │   └── tools.ts              # MCP tool definitions (5 primitives)
│   │
│   └── utils/
│       ├── logger.ts             # Structured logging (pino)
│       ├── errors.ts             # Error types
│       └── sanitize.ts           # HTML/text sanitization
│
├── test/
│   ├── unit/                     # Unit tests per module
│   ├── integration/              # API endpoint tests
│   └── fixtures/                 # Test HTML pages
│
├── profiles/                     # Persistent browser profiles (gitignored)
├── package.json
├── tsconfig.json
├── biome.json
├── vitest.config.ts
└── PLAN.md
```

---

## 5. Core Modules

### 5.1 Browser Engine (`src/browser/engine.ts`)

Manages the Playwright browser lifecycle.

```typescript
// Responsibilities:
// - Launch browser with optimal agent settings
// - Configure: headless, no-sandbox, disable GPU, block unnecessary resources
// - Provide browser instance to session manager
// - Graceful shutdown

interface EngineConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  blockResources: ResourceType[];  // images, fonts, media — save bandwidth
  viewport: { width: number; height: number };
  userAgent?: string;
  proxy?: { server: string; username?: string; password?: string };
}
```

**Resource blocking** is critical for agent use. Agents rarely need images/fonts/media loaded. Blocking these makes pages load 2-5x faster and reduces memory usage.

### 5.2 Session Manager (`src/browser/session-manager.ts`)

Manages concurrent browser sessions with isolation.

```typescript
interface Session {
  id: string;
  page: Page;                    // Playwright page
  context: BrowserContext;       // Isolated context (cookies, storage)
  refs: Map<string, ElementHandle>; // Stable element references
  createdAt: number;
  lastActivity: number;
  profile?: string;              // Optional persistent profile name
}

// Responsibilities:
// - Create sessions with isolated browser contexts
// - Enforce max concurrent sessions (configurable, default 10)
// - Auto-cleanup idle sessions (configurable timeout, default 5min)
// - Optionally persist and restore profiles (cookies, localStorage)
```

### 5.3 Page Processor — Snapshot+Refs (`src/processing/snapshot.ts`)

**This is the most critical module.** It determines what the agent "sees."

The Snapshot+Refs approach (inspired by Vercel's agent-browser) returns only interactive/meaningful elements with stable reference IDs, achieving ~93% context reduction vs. full accessibility trees.

```typescript
interface PageSnapshot {
  url: string;
  title: string;
  refs: RefElement[];            // Only interactive + meaningful elements
  text?: string;                 // Cleaned visible text (optional, on request)
}

interface RefElement {
  ref: string;                   // Stable reference ID, e.g. "r1", "r2"
  role: string;                  // ARIA role: button, link, textbox, etc.
  name: string;                  // Accessible name / visible label
  value?: string;                // Current value (for inputs)
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  options?: string[];            // For select/combobox
  description?: string;          // Additional ARIA description
}
```

**Filtering rules:**
1. Walk the accessibility tree
2. Keep elements with interactive roles: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`, `menuitem`, `tab`, `switch`, `slider`
3. Keep elements with meaningful content roles: `heading`, `img` (with alt text), `alert`, `status`, `dialog`
4. Skip decorative elements, empty containers, layout dividers
5. Assign stable sequential refs (`r1`, `r2`, ...) that persist across snapshots of the same page (re-mapped on navigation)
6. Truncate overly long names/values to configurable max length

**Example output an agent would see:**

```
Page: "GitHub - Login"
URL: https://github.com/login

[r1] heading: "Sign in to GitHub"
[r2] textbox: "Username or email address" value=""
[r3] textbox: "Password" value=""
[r4] link: "Forgot password?"
[r5] button: "Sign in"
[r6] link: "Create an account"
```

Compare this to Playwright MCP which would return hundreds of nodes including every `<div>`, `<span>`, and invisible element. The agent can immediately reason about this and act: "type into r2, type into r3, click r5."

### 5.4 Content Extractor (`src/processing/content.ts`)

For when agents need page content (articles, product info, search results), not just interactive elements.

```typescript
interface ExtractOptions {
  mode: 'text' | 'markdown' | 'structured';
  selector?: string;             // CSS selector to scope extraction
  schema?: JsonSchema;           // For structured mode — validate output shape
  maxLength?: number;            // Truncate to N chars
}
```

**Strategies:**
- `text` — Cleaned visible text, stripped of scripts/styles/nav boilerplate. Uses Mozilla's Readability algorithm.
- `markdown` — Convert meaningful HTML to markdown (preserving links, headings, lists, tables).
- `structured` — Extract data matching a JSON schema. Uses CSS selectors + heuristics to map page content to schema fields. No LLM call — pure DOM parsing.

### 5.5 Action Executor (`src/actions/`)

Each action module handles one interaction type with built-in robustness.

**Smart targeting:** Actions accept either a `ref` (from snapshot) or a CSS/text selector as fallback.

```typescript
interface ActionTarget {
  ref?: string;       // Preferred: "r5"
  selector?: string;  // Fallback: "button.submit" or "text=Sign in"
}

interface ActionResult {
  success: boolean;
  snapshot: PageSnapshot;   // Updated snapshot AFTER the action
  error?: string;
  url: string;              // Current URL (may have changed)
}
```

**Built-in robustness per action:**
- `click` — scroll into view, wait for element to be visible + enabled, click, wait for navigation or network idle
- `type` — clear existing value first (triple-click + delete), type with realistic delays (optional), handle contenteditable
- `select` — handle both native `<select>` and custom dropdown components
- `scroll` — directional (up/down/left/right) or scroll-to-element
- `navigate` — goto URL, wait for configurable load state (domcontentloaded | networkidle | load)

---

## 6. API Design

### Base URL: `http://localhost:3000` (configurable)

### Endpoints

#### Session Management

```
POST   /sessions                  Create a new browser session
DELETE /sessions/:id              Destroy a session
GET    /sessions                  List active sessions
```

#### The 5 Agent Primitives

```
POST   /sessions/:id/navigate    Navigate to a URL
POST   /sessions/:id/act         Perform an action (click, type, select, scroll)
POST   /sessions/:id/extract     Extract page content
GET    /sessions/:id/observe     Get current page snapshot (interactive elements)
GET    /sessions/:id/screenshot   Capture a screenshot
```

### Request/Response Examples

#### Create Session
```http
POST /sessions
Content-Type: application/json

{
  "profile": "my-github-session",    // optional: reuse cookies/state
  "viewport": { "width": 1280, "height": 720 },  // optional
  "blockResources": ["image", "font", "media"]    // optional
}
```
```json
{
  "id": "sess_a1b2c3",
  "url": "about:blank",
  "createdAt": "2026-02-06T10:00:00Z"
}
```

#### Navigate
```http
POST /sessions/sess_a1b2c3/navigate
Content-Type: application/json

{
  "url": "https://github.com/login",
  "waitUntil": "networkidle"       // optional: "load" | "domcontentloaded" | "networkidle"
}
```
```json
{
  "url": "https://github.com/login",
  "title": "Sign in to GitHub",
  "snapshot": {
    "refs": [
      { "ref": "r1", "role": "heading", "name": "Sign in to GitHub" },
      { "ref": "r2", "role": "textbox", "name": "Username or email address", "value": "" },
      { "ref": "r3", "role": "textbox", "name": "Password", "value": "" },
      { "ref": "r4", "role": "link", "name": "Forgot password?" },
      { "ref": "r5", "role": "button", "name": "Sign in" },
      { "ref": "r6", "role": "link", "name": "Create an account" }
    ]
  }
}
```

#### Act
```http
POST /sessions/sess_a1b2c3/act
Content-Type: application/json

{
  "action": "type",
  "ref": "r2",
  "value": "myusername"
}
```
```json
{
  "success": true,
  "url": "https://github.com/login",
  "snapshot": {
    "refs": [
      { "ref": "r1", "role": "heading", "name": "Sign in to GitHub" },
      { "ref": "r2", "role": "textbox", "name": "Username or email address", "value": "myusername" },
      { "ref": "r3", "role": "textbox", "name": "Password", "value": "" },
      { "ref": "r4", "role": "link", "name": "Forgot password?" },
      { "ref": "r5", "role": "button", "name": "Sign in" },
      { "ref": "r6", "role": "link", "name": "Create an account" }
    ]
  }
}
```

#### Extract
```http
POST /sessions/sess_a1b2c3/extract
Content-Type: application/json

{
  "mode": "structured",
  "selector": ".repo-list",
  "schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "description": { "type": "string" },
        "stars": { "type": "number" }
      }
    }
  }
}
```

#### Observe
```http
GET /sessions/sess_a1b2c3/observe
```
Returns the current page snapshot (same format as navigate response). Lightweight — no action taken, just reads current state.

#### Screenshot
```http
GET /sessions/sess_a1b2c3/screenshot?fullPage=false&quality=50
```
Returns JPEG image. Quality parameter (1-100) controls compression. Agents should use this sparingly — observe/extract are cheaper.

---

## 7. Agent Interface — The 5 Primitives

The API surface is intentionally small. Research shows agents perform better with fewer, more powerful tools than with many specific ones. steer exposes exactly **5 primitives**:

| # | Primitive | What it does | When to use |
|---|---|---|---|
| 1 | **navigate** | Go to a URL | Starting a task, following a link by URL |
| 2 | **act** | Click, type, select, scroll | Any page interaction |
| 3 | **extract** | Get page content as text/markdown/structured data | Reading articles, scraping data, getting search results |
| 4 | **observe** | Get current interactive elements (Snapshot+Refs) | Planning next action, checking page state |
| 5 | **screenshot** | Capture visual snapshot | Visual verification, debugging, CAPTCHA inspection |

### Why only 5?

Playwright MCP exposes 26+ tools. When an agent has 26 tools, it spends tokens deciding *which* tool to use. With 5, the choice is obvious:
- Need to go somewhere? → `navigate`
- Need to do something? → `act`
- Need to read something? → `extract`
- Need to see what's possible? → `observe`
- Need to see visually? → `screenshot`

The `act` primitive handles all interactions through a single endpoint with an `action` field. This collapses click/type/select/scroll/hover into one tool call with different parameters.

---

## 8. Context Efficiency — The Key Differentiator

Context window management is the #1 problem with browser agents. steer addresses this at every layer:

### 8.1 Snapshot+Refs (93% reduction)

Full accessibility tree of github.com: ~3,000 nodes, ~15,000 tokens.
steer snapshot of github.com: ~30-80 refs, ~500-1,200 tokens.

### 8.2 Resource Blocking

By default, block images/fonts/media/tracking scripts. Pages load faster and don't trigger unnecessary network activity that bloats wait times.

### 8.3 Content Extraction Modes

- `text` mode strips all HTML, returning clean prose. A 50KB HTML page becomes 2KB of text.
- `markdown` mode preserves structure (headings, links, lists) while stripping decoration. A 50KB page becomes 3-5KB.
- `structured` mode returns only the fields the agent asked for in its schema. Minimal tokens.

### 8.4 Automatic Truncation

All text responses have configurable `maxLength`. Default: 4000 chars for extract, no limit for observe (already minimal).

### 8.5 Every Response Includes Updated Snapshot

After every `act` and `navigate`, the response includes the new page snapshot. The agent doesn't need a separate `observe` call after each action — it already has the updated state. This halves the number of API calls in a typical workflow.

---

## 9. Session & State Management

### 9.1 Session Lifecycle

```
create session → navigate → [act/extract/observe/screenshot]* → destroy session
```

Sessions auto-expire after configurable idle timeout (default: 5 minutes). Active sessions are tracked in memory.

### 9.2 Persistent Profiles

For tasks requiring authentication, agents can create named profiles:

```http
POST /sessions
{ "profile": "github-work" }
```

Profiles persist cookies, localStorage, and sessionStorage to disk (`profiles/` directory). When a session is created with a profile name:
- If profile exists → restore cookies/storage from disk
- If profile is new → start fresh, save state on session close

This means an agent can log in once, and subsequent sessions reuse the authenticated state.

### 9.3 Concurrency

- Default max concurrent sessions: 10
- Each session runs in an isolated BrowserContext (separate cookies, cache, storage)
- Session manager tracks resource usage and rejects new sessions when at capacity

---

## 10. Security Model

### 10.1 Domain Allowlist (opt-in)

```
STEER_ALLOWED_DOMAINS=github.com,google.com,stackoverflow.com
```

When set, the browser will only navigate to allowed domains. All other navigations are blocked. This prevents prompt injection attacks where a malicious page tries to redirect the agent to an attacker-controlled site.

### 10.2 No Arbitrary Code Execution

steer does NOT expose `page.evaluate()` or any arbitrary JavaScript execution endpoint. All interactions go through the structured action primitives. This prevents agents from being tricked into running malicious scripts.

### 10.3 Request Sanitization

All user inputs (URLs, selectors, typed text) are sanitized:
- URLs must be valid HTTP(S) (no `javascript:`, `data:`, `file:` protocols)
- Selectors are validated as CSS selectors (no script injection)
- Typed text is passed through Playwright's keyboard API (no code execution)

### 10.4 Resource Limits

- Max sessions per server: configurable (default 10)
- Session idle timeout: configurable (default 5 minutes)
- Max navigation timeout: 30 seconds
- Max page content size for extraction: 1MB
- Rate limiting on API endpoints (configurable)

### 10.5 Network Isolation

The browser runs in the server's network context. For production use, run steer in a container with restricted network access (e.g., Docker with `--network` constraints).

---

## 11. MCP Server Integration

steer includes an optional MCP (Model Context Protocol) server that exposes the same 5 primitives as MCP tools. This allows direct integration with Claude Desktop, Cursor, VS Code Copilot, and other MCP-compatible hosts.

### MCP Tool Definitions

```typescript
const tools = [
  {
    name: "browser_navigate",
    description: "Navigate to a URL. Returns page snapshot with interactive elements.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        sessionId: { type: "string", description: "Session ID (auto-created if omitted)" }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_act",
    description: "Perform an action: click, type, select, or scroll. Use ref IDs from observe/navigate.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["click", "type", "select", "scroll"] },
        ref: { type: "string", description: "Element reference from snapshot, e.g. 'r5'" },
        value: { type: "string", description: "Value to type or option to select" },
        direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
        sessionId: { type: "string" }
      },
      required: ["action"]
    }
  },
  {
    name: "browser_extract",
    description: "Extract page content as clean text, markdown, or structured data.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["text", "markdown", "structured"], default: "markdown" },
        selector: { type: "string", description: "CSS selector to scope extraction" },
        sessionId: { type: "string" }
      }
    }
  },
  {
    name: "browser_observe",
    description: "Get current page state: URL, title, and all interactive elements with ref IDs.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" }
      }
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the current page. Use sparingly — observe is more token-efficient.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: { type: "boolean", default: false },
        sessionId: { type: "string" }
      }
    }
  }
];
```

### MCP vs REST

| | REST API | MCP Server |
|---|---|---|
| **Use case** | Custom agents, scripts, any language | Claude Desktop, Cursor, MCP hosts |
| **Session mgmt** | Explicit (create/destroy) | Auto-managed (one default session) |
| **Transport** | HTTP | stdio (local) or SSE (remote) |
| **Auth** | None needed (localhost) | None needed (local MCP) |

Both use the exact same core modules. The MCP server is a thin adapter over the same session manager, page processor, and action executor.

---

## 12. Testing Strategy

### 12.1 Unit Tests

- **Snapshot processor**: Given mock accessibility trees, verify correct filtering and ref assignment
- **Content extractor**: Given mock HTML, verify text/markdown/structured extraction
- **Action executor**: Verify parameter validation and error handling
- **Session manager**: Verify lifecycle, concurrency limits, timeout cleanup

### 12.2 Integration Tests

- **API endpoints**: Full request/response testing against a local test server serving fixture HTML pages
- **Navigation flow**: Create session → navigate → act → extract → destroy
- **Profile persistence**: Create profile → log in → destroy session → new session with same profile → verify cookies restored

### 12.3 Fixture Pages

```
test/fixtures/
├── login-form.html       # Username/password form
├── search-results.html   # List of results with pagination
├── complex-spa.html      # SPA with dynamic content
├── table-data.html       # Structured data in tables
└── accessibility.html    # Various ARIA roles and states
```

### 12.4 Benchmark Tests

- **Token count**: Measure snapshot token count for real-world pages vs. full accessibility tree
- **Response time**: Measure end-to-end latency for each primitive
- **Concurrency**: 10 parallel sessions performing actions simultaneously

---

## 13. Implementation Phases

### Phase 1 — Foundation (Core Loop)
**Goal:** Agent can navigate to a page, see interactive elements, and interact with them.

- [ ] Project scaffold: package.json, tsconfig, biome, vitest
- [ ] Browser engine: launch/close Playwright Chromium
- [ ] Session manager: create/destroy sessions, basic lifecycle
- [ ] Snapshot processor: accessibility tree → filtered Snapshot+Refs
- [ ] Action executor: click, type (basic implementations)
- [ ] REST API: POST /sessions, DELETE /sessions/:id, POST /navigate, POST /act, GET /observe
- [ ] Basic integration test: navigate → observe → type → click

**Milestone:** Can control a browser through HTTP and get minimal, useful snapshots.

### Phase 2 — Content & Extraction
**Goal:** Agent can extract meaningful content from pages.

- [ ] Content extractor: text mode (readability-based cleaning)
- [ ] Content extractor: markdown mode (HTML → markdown conversion)
- [ ] Content extractor: structured mode (schema-based extraction)
- [ ] Screenshot endpoint with quality control
- [ ] Resource blocking (images, fonts, media)
- [ ] POST /extract and GET /screenshot endpoints
- [ ] Unit tests for content extraction

**Milestone:** Agent can read and extract data from any page.

### Phase 3 — Robustness & Polish
**Goal:** Production-ready reliability.

- [ ] Smart waits: network idle, DOM stability detection
- [ ] Action robustness: scroll-into-view, retry on stale element
- [ ] Select/dropdown handling (native + custom components)
- [ ] Scroll action (directional + to-element)
- [ ] Session idle timeout & auto-cleanup
- [ ] Persistent profiles (cookie/storage save/restore)
- [ ] Error handling: consistent error responses, meaningful messages
- [ ] Security: URL validation, domain allowlist, rate limiting
- [ ] Logging: structured request/response logging with pino
- [ ] Configuration: environment variables for all settings

**Milestone:** Reliable enough for unattended multi-step agent workflows.

### Phase 4 — MCP Server
**Goal:** Works with Claude Desktop, Cursor, and other MCP hosts.

- [ ] MCP server with 5 tool definitions
- [ ] Auto session management (create on first use, reuse within conversation)
- [ ] stdio transport for local use
- [ ] SSE transport for remote use
- [ ] MCP integration tests

**Milestone:** `steer` appears as a tool in Claude Desktop / Cursor.

### Phase 5 — Advanced Features
**Goal:** Competitive with paid alternatives.

- [ ] Mobile viewport mode (serve mobile-optimized sites to agents)
- [ ] Tab management (open/switch/close tabs within a session)
- [ ] File download/upload handling
- [ ] Basic anti-detection (realistic user agent, viewport, webdriver flag removal)
- [ ] WebSocket live events (page load, navigation, console errors)
- [ ] Docker image for one-command deployment
- [ ] CLI tool: `npx steer` to start server instantly
- [ ] Benchmark suite: token efficiency, latency, success rate on web tasks

**Milestone:** Feature-complete, deployable, benchmarked.

---

## 14. Benchmarking & Evaluation

### 14.1 Token Efficiency Benchmark

Compare steer snapshot vs. Playwright MCP accessibility tree on 20 real-world pages:
- Simple: Google search, Wikipedia article, Hacker News
- Medium: GitHub repo page, Amazon product page, Reddit thread
- Complex: Gmail inbox, Jira board, Figma dashboard

Metric: **tokens per snapshot** (measured via tiktoken).

Target: **90%+ reduction** vs. full accessibility tree.

### 14.2 Latency Benchmark

Measure per-primitive latency:
- `navigate` (cold): < 3s for typical pages
- `navigate` (with resource blocking): < 1.5s
- `act` (click/type): < 500ms
- `observe`: < 200ms
- `extract` (text): < 500ms
- `screenshot`: < 1s

### 14.3 Reliability Benchmark

Run 100 automated workflows across 10 sites:
- Login flows
- Search and extract
- Form filling
- Multi-page navigation

Metric: **success rate** (% of workflows completed without error).

Target: **> 90% success rate** on supported sites.

---

## Summary

steer is a focused, opinionated tool:

- **5 primitives** instead of 26+ tools
- **Snapshot+Refs** instead of full accessibility trees (93% fewer tokens)
- **REST API** instead of language-locked SDKs
- **Self-hosted** instead of pay-per-session cloud
- **Secure by default** instead of arbitrary eval

The total scope is ~2,500-3,500 lines of TypeScript across ~25 files. No external AI dependencies, no API keys, no cloud services. Just Playwright, Fastify, and smart page processing.
