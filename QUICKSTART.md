# Quick Start

Get steer running in under 5 minutes. This guide walks you through installation, starting the server, and making your first API calls.

---

## Prerequisites

- **Node.js 24 or later** -- check with `node --version`
- **npm** -- ships with Node.js

---

## Installation

```bash
# Clone the repository
git clone https://github.com/enderekici/steer.git
cd steer

# Install dependencies
npm install

# Install the default browser (Firefox)
npx playwright install firefox
```

---

## Starting the Server

### REST API

```bash
npm run dev
```

The server starts at `http://localhost:3000`. You should see log output confirming the browser launched and the server is listening.

### MCP Server (for Claude Desktop / Claude Code)

```bash
npm run mcp:dev
```

This starts the MCP server using stdio transport, suitable for direct integration with AI tools.

---

## Your First API Calls

Open a new terminal and follow these steps. Each step builds on the previous one.

### 1. Check Server Health

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "sessions": 0,
  "config": {
    "maxSessions": 10,
    "sessionTimeoutMs": 300000,
    "requestTimeoutMs": 30000
  }
}
```

### 2. Create a Session

```bash
curl -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Response:

```json
{
  "id": "abc123xyz",
  "url": "about:blank",
  "createdAt": 1707350400000
}
```

Save the session ID. The examples below use `$ID` as a placeholder -- replace it with the actual value.

```bash
export ID="abc123xyz"
```

### 3. Navigate to a Page

```bash
curl -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }'
```

Response includes a snapshot of the page with ref IDs for interactive elements:

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

### 4. Observe the Page

Get the current accessibility snapshot without performing any action:

```bash
curl http://localhost:3000/sessions/$ID/observe
```

Use query parameters for more control:

```bash
# Minimal output (fewer tokens)
curl "http://localhost:3000/sessions/$ID/observe?verbosity=minimal"

# Limit to 5 elements
curl "http://localhost:3000/sessions/$ID/observe?maxRefs=5"
```

### 5. Perform an Action

Click a link using its ref ID from the snapshot:

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r2" }'
```

Every action returns a fresh snapshot, so you always know the current state of the page.

### 6. Extract Content

Pull the page content as clean markdown:

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "markdown" }'
```

Other extraction modes:

```bash
# Plain text (uses Mozilla Readability)
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "text" }'

# Structured data with a JSON schema
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "structured",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" }
      }
    }
  }'
```

### 7. Take a Screenshot

```bash
curl http://localhost:3000/sessions/$ID/screenshot > page.jpg
```

### 8. Clean Up

```bash
curl -X DELETE http://localhost:3000/sessions/$ID
```

Sessions also auto-expire after 5 minutes of inactivity.

---

## Docker Quick Start

If you prefer running steer in a container:

```bash
# Build and start the REST API
docker compose up steer

# Server available at http://localhost:3000
```

To run both the REST API and MCP server:

```bash
docker compose up -d
```

This starts:
- **REST API** on port 3000
- **MCP server** (HTTP transport) on port 3001

Stop everything with:

```bash
docker compose down
```

---

## Connecting to Claude Desktop

### Option A: Local npm (stdio)

Add to your Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "steer": {
      "command": "npx",
      "args": ["steer", "--mcp"]
    }
  }
}
```

### Option B: Docker (HTTP)

Start the MCP container, then point Claude Desktop to it:

```bash
docker compose up -d steer-mcp
```

```json
{
  "mcpServers": {
    "steer": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Restart Claude Desktop after editing the configuration. The steer tools (`browser_navigate`, `browser_act`, `browser_extract`, `browser_observe`, `browser_screenshot`) will appear automatically.

---

## Connecting to Claude Code

### Option A: Local npm (stdio)

Add to `.claude/settings.json` in your project or home directory:

```json
{
  "mcpServers": {
    "steer": {
      "command": "npx",
      "args": ["steer", "--mcp"]
    }
  }
}
```

### Option B: Docker (HTTP)

```json
{
  "mcpServers": {
    "steer": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

---

## Example: Complete Agent Workflow

Here is a realistic sequence showing how an AI agent uses steer to search the web:

```
1. Navigate to Google
   browser_navigate({ url: "https://google.com" })
   --> snapshot: r3=textbox "Search", r5=button "Google Search"

2. Type a search query
   browser_act({ action: "type", ref: "r3", value: "steer headless browser" })

3. Press Enter
   browser_act({ action: "keyboard", key: "Enter" })

4. Wait for results to load
   browser_act({ action: "wait", selector: "#search", state: "visible" })

5. Extract search results as markdown
   browser_extract({ mode: "markdown" })
   --> clean markdown with links and descriptions

6. Click the first result
   browser_act({ action: "click", ref: "r10" })

7. Extract the article content
   browser_extract({ mode: "text" })
```

The agent uses ref IDs from each snapshot to target elements in subsequent actions. Every action returns a fresh snapshot, so the agent always has an up-to-date view of the page.

---

## What Next?

- **[README.md](README.md)** -- Full API reference with all endpoints, actions, and configuration options.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** -- Technical deep-dive into the snapshot algorithm, session lifecycle, and design decisions.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** -- How to set up a development environment and contribute.
- **[ROADMAP.md](ROADMAP.md)** -- Planned features and known gaps.
