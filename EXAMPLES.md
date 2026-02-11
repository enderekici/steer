# Usage Examples

Practical examples for using steer via the REST API and MCP tools.

All REST API examples use `curl` against `http://localhost:3000`. Start the server first:

```bash
npm run dev          # development
npm start            # production
docker compose up    # Docker
```

---

## Table of Contents

- [REST API Examples](#rest-api-examples)
  - [Health Check](#health-check)
  - [Session Management](#session-management)
  - [Navigation](#navigation)
  - [Observing the Page](#observing-the-page)
  - [Performing Actions](#performing-actions)
  - [Extracting Content](#extracting-content)
  - [Taking Screenshots](#taking-screenshots)
- [MCP Tool Examples](#mcp-tool-examples)
- [Common Workflows](#common-workflows)
  - [Log in to a Website](#log-in-to-a-website)
  - [Scrape Data from a Page](#scrape-data-from-a-page)
  - [Fill Out a Multi-Step Form](#fill-out-a-multi-step-form)
  - [Search and Extract Results](#search-and-extract-results)
  - [Take a Screenshot of a Page](#take-a-screenshot-of-a-page)
- [Session Management Patterns](#session-management-patterns)
- [Error Handling Examples](#error-handling-examples)

---

## REST API Examples

### Health Check

```bash
curl http://localhost:3000/health
```

Response:

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

### Session Management

#### Create a session

```bash
curl -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Response:

```json
{
  "id": "V1StGXR8_Z5jdHi",
  "url": "about:blank",
  "createdAt": 1707350400000
}
```

#### Create a session with custom viewport

```bash
curl -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{
    "viewport": { "width": 1920, "height": 1080 },
    "blockResources": ["image", "font", "media"]
  }'
```

#### List all sessions

```bash
curl http://localhost:3000/sessions
```

Response:

```json
{
  "sessions": [
    {
      "id": "V1StGXR8_Z5jdHi",
      "url": "https://example.com",
      "createdAt": 1707350400000,
      "lastActivity": 1707350450000
    }
  ]
}
```

#### Delete a session

```bash
curl -X DELETE http://localhost:3000/sessions/V1StGXR8_Z5jdHi
```

Response:

```json
{ "success": true }
```

---

### Navigation

#### Navigate to a URL

```bash
ID="V1StGXR8_Z5jdHi"

curl -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }'
```

Response includes a snapshot of all interactive elements:

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "snapshot": {
    "url": "https://example.com/",
    "title": "Example Domain",
    "refs": [
      { "ref": "r1", "role": "heading", "name": "Example Domain" },
      { "ref": "r2", "role": "link", "name": "More information..." }
    ]
  }
}
```

#### Navigate with a wait condition

```bash
curl -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com",
    "waitUntil": "networkidle"
  }'
```

---

### Observing the Page

#### Get the current page snapshot

```bash
curl http://localhost:3000/sessions/$ID/observe
```

Response:

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "refs": [
    { "ref": "r1", "role": "heading", "name": "Example Domain" },
    { "ref": "r2", "role": "link", "name": "More information..." }
  ]
}
```

#### Minimal verbosity (fewer tokens)

```bash
curl "http://localhost:3000/sessions/$ID/observe?verbosity=minimal"
```

Returns only `ref`, `role`, and `name` for each element.

#### Detailed verbosity

```bash
curl "http://localhost:3000/sessions/$ID/observe?verbosity=detailed"
```

Returns all fields including descriptions.

#### Scoped observation

Restrict the snapshot to a specific part of the page:

```bash
curl "http://localhost:3000/sessions/$ID/observe?scope=form.login"
```

#### Limit number of results

```bash
curl "http://localhost:3000/sessions/$ID/observe?maxRefs=5"
```

#### Combine options

```bash
curl "http://localhost:3000/sessions/$ID/observe?verbosity=minimal&scope=%23main&maxRefs=10"
```

---

### Performing Actions

#### Click an element

Using a ref ID from a previous snapshot:

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r2" }'
```

Using a CSS selector:

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "selector": "button.submit" }'
```

#### Type text into an input

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r3", "value": "hello world" }'
```

#### Select a dropdown option

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "select", "ref": "r7", "value": "option2" }'
```

#### Scroll the page

```bash
# Scroll down
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "scroll", "direction": "down" }'

# Scroll up
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "scroll", "direction": "up" }'

# Scroll an element into view
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "scroll", "ref": "r15" }'
```

#### Wait for an element

```bash
# Wait for an element to become visible
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": "#results", "state": "visible", "timeout": 10000 }'

# Wait for an element to be removed
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": ".loading-spinner", "state": "detached" }'

# Wait for network idle (no selector)
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "timeout": 5000 }'
```

#### Press keyboard keys

```bash
# Press Enter
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Enter" }'

# Press Escape
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Escape" }'

# Select all text (Ctrl+A)
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Control+a" }'

# Copy (Ctrl+C)
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Control+c" }'
```

#### Hover over an element

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "hover", "ref": "r4" }'
```

#### Upload a file

```bash
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "upload", "ref": "r8", "filePaths": ["/path/to/document.pdf"] }'
```

#### Handle dialogs

```bash
# Accept the next dialog (alert/confirm/prompt)
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "dialog", "dialogAction": "accept" }'

# Dismiss the next dialog
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "dialog", "dialogAction": "dismiss" }'

# Accept a prompt dialog with text
curl -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "dialog", "dialogAction": "accept", "promptText": "my answer" }'
```

#### Action response format

All actions return the same response shape:

```json
{
  "success": true,
  "snapshot": {
    "url": "https://example.com/page",
    "title": "Page Title",
    "refs": [
      { "ref": "r1", "role": "heading", "name": "Page Title" }
    ]
  },
  "url": "https://example.com/page"
}
```

---

### Extracting Content

#### Extract as plain text

Uses Mozilla Readability to extract the main content:

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "text" }'
```

#### Extract as markdown

Preserves headings, links, lists, and other formatting:

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "markdown" }'
```

#### Extract from a specific section

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "markdown", "selector": "article.main-content" }'
```

#### Extract structured data

Extract an array of items matching a JSON schema:

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "structured",
    "selector": ".product",
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

Response:

```json
{
  "content": [
    { "name": "Wireless Mouse", "price": 29.99, "url": "https://example.com/mouse" },
    { "name": "Keyboard", "price": 49.99, "url": "https://example.com/keyboard" }
  ],
  "url": "https://example.com/products",
  "title": "Products"
}
```

#### Extract a single object

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "structured",
    "selector": ".profile-card",
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "title": { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }'
```

#### Limit content length

```bash
curl -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "text", "maxLength": 1000 }'
```

---

### Taking Screenshots

#### Viewport screenshot

```bash
curl http://localhost:3000/sessions/$ID/screenshot > page.jpg
```

#### Full page screenshot

```bash
curl "http://localhost:3000/sessions/$ID/screenshot?fullPage=true" > full-page.jpg
```

#### High quality screenshot

```bash
curl "http://localhost:3000/sessions/$ID/screenshot?quality=90" > high-quality.jpg
```

The REST API returns JPEG images. Quality defaults to 50.

---

## MCP Tool Examples

These examples show how an AI agent would call steer tools via MCP. The tools are available in Claude Desktop, Claude Code, Cursor, and other MCP-compatible clients.

### Navigate to a page

```json
{
  "tool": "browser_navigate",
  "arguments": {
    "url": "https://news.ycombinator.com"
  }
}
```

Returns a text snapshot:

```
Page: Hacker News
URL: https://news.ycombinator.com/
---
[r1] link "Hacker News"
[r2] link "new"
[r3] link "past"
[r4] link "comments"
[r5] link "ask"
...
```

### Click a link

```json
{
  "tool": "browser_act",
  "arguments": {
    "action": "click",
    "ref": "r5"
  }
}
```

### Type into a search field

```json
{
  "tool": "browser_act",
  "arguments": {
    "action": "type",
    "ref": "r12",
    "value": "steer headless browser"
  }
}
```

### Submit a form with Enter

```json
{
  "tool": "browser_act",
  "arguments": {
    "action": "keyboard",
    "key": "Enter"
  }
}
```

### Wait for results to load

```json
{
  "tool": "browser_act",
  "arguments": {
    "action": "wait",
    "selector": ".results-container",
    "state": "visible",
    "timeout": 10000
  }
}
```

### Extract page content as markdown

```json
{
  "tool": "browser_extract",
  "arguments": {
    "mode": "markdown"
  }
}
```

### Get a minimal snapshot

```json
{
  "tool": "browser_observe",
  "arguments": {
    "verbosity": "minimal",
    "maxRefs": 20
  }
}
```

### Take a screenshot

```json
{
  "tool": "browser_screenshot",
  "arguments": {
    "fullPage": false
  }
}
```

Returns a base64-encoded PNG image.

### Use a specific session

All tools accept an optional `sessionId`. If omitted, a default session is created automatically and reused.

```json
{
  "tool": "browser_navigate",
  "arguments": {
    "url": "https://example.com",
    "sessionId": "my-session-id"
  }
}
```

---

## Common Workflows

### Log in to a Website

```bash
# 1. Create a session
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{}' | jq -r '.id')

# 2. Navigate to the login page
curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com/login" }' | jq '.snapshot.refs[] | {ref, role, name}'

# 3. Type the username (using ref from snapshot)
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r3", "value": "myusername" }'

# 4. Type the password
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r4", "value": "mypassword" }'

# 5. Click the login button
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r5" }'

# 6. Wait for the dashboard to load
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": ".dashboard", "state": "visible" }'
```

### Scrape Data from a Page

```bash
# 1. Create session and navigate
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com/products" }' > /dev/null

# 2. Extract structured product data
curl -s -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "structured",
    "selector": ".product-card",
    "schema": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "price": { "type": "number" },
          "url": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    }
  }' | jq '.content'

# 3. Clean up
curl -s -X DELETE http://localhost:3000/sessions/$ID
```

### Fill Out a Multi-Step Form

```bash
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

# Navigate to the form
curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com/apply" }' > /dev/null

# Observe the form to get ref IDs
curl -s http://localhost:3000/sessions/$ID/observe | jq '.refs'

# Fill in text fields
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r2", "value": "Jane Doe" }'

curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r3", "value": "jane@example.com" }'

# Select a dropdown
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "select", "ref": "r4", "value": "engineering" }'

# Check a checkbox
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r5" }'

# Upload a resume
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "upload", "ref": "r6", "filePaths": ["/path/to/resume.pdf"] }'

# Submit the form
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r7" }'

# Wait for confirmation
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": ".confirmation", "state": "visible" }'

# Extract confirmation message
curl -s -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "text", "selector": ".confirmation" }'
```

### Search and Extract Results

```bash
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

# Navigate to a search engine
curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://www.google.com" }' > /dev/null

# Observe to find the search box
curl -s http://localhost:3000/sessions/$ID/observe?verbosity=minimal | jq '.refs'

# Type the search query
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r3", "value": "steer headless browser for AI agents" }'

# Press Enter to search
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "keyboard", "key": "Enter" }'

# Wait for results
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "wait", "selector": "#search", "state": "visible" }'

# Extract results as markdown
curl -s -X POST http://localhost:3000/sessions/$ID/extract \
  -H 'Content-Type: application/json' \
  -d '{ "mode": "markdown", "maxLength": 2000 }'
```

### Take a Screenshot of a Page

```bash
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

# Navigate
curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }' > /dev/null

# Viewport screenshot
curl -s http://localhost:3000/sessions/$ID/screenshot > viewport.jpg

# Full page screenshot at high quality
curl -s "http://localhost:3000/sessions/$ID/screenshot?fullPage=true&quality=90" > fullpage.jpg

# Clean up
curl -s -X DELETE http://localhost:3000/sessions/$ID
```

---

## Session Management Patterns

### Single session (simple scripts)

For simple scripts that interact with one page at a time, create a session at the start and delete it when done:

```bash
ID=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

# ... do work ...

curl -s -X DELETE http://localhost:3000/sessions/$ID
```

### Multiple concurrent sessions

For parallel scraping or multi-site workflows, create separate sessions:

```bash
ID1=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

ID2=$(curl -s -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.id')

# Navigate each session to different sites
curl -s -X POST http://localhost:3000/sessions/$ID1/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://site-a.com" }' &

curl -s -X POST http://localhost:3000/sessions/$ID2/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://site-b.com" }' &

wait
```

### Session auto-cleanup

Sessions are automatically cleaned up after 5 minutes of inactivity (configurable via `STEER_SESSION_TIMEOUT_MS`). Each action or observation resets the idle timer.

### MCP default session

When using MCP tools, if you omit `sessionId`, a default session is created automatically on first use and reused for all subsequent calls. This is the simplest pattern for single-agent use.

---

## Error Handling Examples

### Session not found

```bash
curl -s -X POST http://localhost:3000/sessions/invalid-id/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }'
```

Response (404):

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session not found: invalid-id",
    "statusCode": 404
  }
}
```

### Invalid ref ID

```bash
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "click", "ref": "r999" }'
```

Response (400):

```json
{
  "error": {
    "code": "ACTION_FAILED",
    "message": "Element ref \"r999\" not found in current snapshot. Available refs: r1, r2, r3, r4, r5",
    "statusCode": 400
  }
}
```

### Blocked URL protocol

```bash
curl -s -X POST http://localhost:3000/sessions/$ID/navigate \
  -H 'Content-Type: application/json' \
  -d '{ "url": "javascript:alert(1)" }'
```

Response (400):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Blocked URL protocol: javascript:",
    "statusCode": 400
  }
}
```

### Domain not allowed

When `STEER_ALLOWED_DOMAINS` is set and the target domain is not in the list:

```json
{
  "error": {
    "code": "DOMAIN_NOT_ALLOWED",
    "message": "Domain not allowed: evil.com",
    "statusCode": 403
  }
}
```

### Session limit reached

When `STEER_MAX_SESSIONS` sessions are already active:

```json
{
  "error": {
    "code": "SESSION_LIMIT_REACHED",
    "message": "Maximum number of sessions (10) reached",
    "statusCode": 429
  }
}
```

### Missing required parameters

```bash
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "type", "ref": "r1" }'
```

Response (400):

```json
{
  "error": {
    "code": "ACTION_FAILED",
    "message": "Action failed: type -- requires a \"value\" parameter",
    "statusCode": 400
  }
}
```

### Invalid action name

```bash
curl -s -X POST http://localhost:3000/sessions/$ID/act \
  -H 'Content-Type: application/json' \
  -d '{ "action": "fly" }'
```

Response (400 -- Fastify schema validation):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "body/action must be equal to one of the allowed values",
    "statusCode": 400
  }
}
```
