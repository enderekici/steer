# Changelog

All notable changes to steer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-02-09

Project renamed from **abbwak** to **steer**. All packages, configuration variables, Docker labels, CLI commands, and documentation updated to reflect the new name.

### Changed

- Renamed project from `abbwak` to `steer` across the entire codebase.
- Package name changed to `steer` in `package.json`.
- CLI binary renamed to `steer` (was `abbwak`).
- All environment variables now use the `STEER_` prefix (was `ABBWAK_`).
- DOM ref attributes renamed to `data-steer-ref` (was `data-abbwak-ref`).
- Docker image labels and user/group updated to `steer`.
- Repository URL updated to `https://github.com/enderekici/steer.git`.

### Updated

- Upgraded all dependencies to latest versions:
  - `fastify` ^5.2.0
  - `playwright` ^1.58.2
  - `@modelcontextprotocol/sdk` ^1.26.0
  - `pino` ^10.3.1, `pino-pretty` ^13.1.3
  - `zod` ^4.3.6
  - `typescript` ^5.9.3
  - `vitest` ^4.0.18
  - `@biomejs/biome` ^2.3.14
  - `tsup` ^8.5.1, `tsx` ^4.21.0
  - `@types/node` ^25.2.3
- Docker base image updated to `mcr.microsoft.com/playwright:v1.58.2-noble`.
- Node.js engine requirement set to `>=24.0.0`.

---

## [1.1.0] - 2026-02-09

Added MCP Streamable HTTP transport, enabling Docker-based MCP deployments that Claude Desktop and Claude Code can connect to over HTTP.

### Added

- **MCP Streamable HTTP transport** (`--mcp-http` CLI flag): Run the MCP server as a long-lived HTTP service instead of stdio. Supports multiple concurrent client sessions.
- **Docker MCP service** (`steer-mcp`): New service in `docker-compose.yml` that runs the MCP server on port 3001, accessible at `http://localhost:3001/mcp`.
- **MCP HTTP dev script** (`npm run mcp:http:dev`): Development mode for the HTTP transport.
- Docker Compose configuration for both REST API and MCP services with resource limits, healthchecks, and security options.
- Documentation for connecting Claude Desktop and Claude Code to the Dockerized MCP server via the `url` field in MCP configuration.

### Fixed

- Integration tests now use the configurable browser engine instead of hardcoded Chromium.
- Flaky click test fixed by targeting a button element instead of a link that triggers page navigation.
- TypeScript type error in `isRunning()` return type corrected.
- All Biome lint errors resolved: import sorting, quote style, formatting, and `any` type annotations.

### Infrastructure

- Added GitHub Actions CI pipeline with four jobs: lint/typecheck, build, unit tests (with coverage), integration tests, and Docker build verification.

---

## [1.0.0] - 2026-02-07

Initial release. A self-hosted headless browser for AI agents with two interfaces: REST API (Fastify) and MCP server (stdio).

### Added

- **REST API** (Fastify 5) with 9 endpoints:
  - `GET /health` -- health check with session count.
  - `POST /sessions` -- create a browser session with optional profile, viewport, and resource blocking.
  - `GET /sessions` -- list all active sessions.
  - `DELETE /sessions/:id` -- destroy a session.
  - `POST /sessions/:id/navigate` -- navigate to a URL.
  - `POST /sessions/:id/act` -- perform one of 10 browser actions.
  - `POST /sessions/:id/extract` -- extract page content as text, markdown, or structured JSON.
  - `GET /sessions/:id/observe` -- get an accessibility snapshot with interactive element refs.
  - `GET /sessions/:id/screenshot` -- capture page as JPEG.

- **MCP server** (stdio transport) with 5 tools:
  - `browser_navigate` -- navigate and return page snapshot.
  - `browser_act` -- perform browser actions by ref ID.
  - `browser_extract` -- extract content in three modes.
  - `browser_observe` -- accessibility snapshot with verbosity control.
  - `browser_screenshot` -- capture page as base64 PNG.

- **10 browser actions:**
  - `click` -- click elements with force fallback for obscured elements.
  - `type` -- type text into inputs, textareas, and contenteditable elements with fill/triple-click fallback.
  - `select` -- handle native `<select>` dropdowns and custom dropdown components.
  - `scroll` -- directional scrolling (up/down/left/right) or scroll an element into view.
  - `navigate` -- URL-validated page navigation.
  - `wait` -- wait for element visibility/state or network idle.
  - `keyboard` -- validated key presses and modifier combos (Ctrl, Shift, Alt, Meta).
  - `hover` -- hover to trigger menus and tooltips with 300ms settle time.
  - `upload` -- upload files via file input elements.
  - `dialog` -- configure auto-handling for alert, confirm, and prompt dialogs.

- **Snapshot+Refs system:** Custom DOM walker that filters the page to interactive and structural elements, stamps each with a stable `data-steer-ref` attribute, and returns a compact list. Achieves ~93% context reduction compared to raw accessibility trees.

- **3 content extraction modes:**
  - `text` -- clean article text via Mozilla Readability.
  - `markdown` -- structured markdown via Turndown.
  - `structured` -- schema-driven extraction with smart heuristics for repeated elements, attribute reading, and type coercion.

- **Observe options:** Verbosity levels (minimal, normal, detailed), CSS scope selector, and `maxRefs` limit for further token reduction.

- **CLI** (`steer`, `steer --mcp`, `steer --help`) for standalone usage and global npm install.

- **Docker support:** Multi-stage Dockerfile using Playwright base image with Firefox only (~400MB lighter than all browsers). Docker Compose with memory limits (2GB cap, 512MB reservation).

- **Security:**
  - URL sanitization blocks `javascript:`, `data:`, `file:`, and `vbscript:` protocols.
  - Domain allowlist via `STEER_ALLOWED_DOMAINS`.
  - CSS selector validation against injection patterns.
  - Keyboard input whitelist.
  - Rate limiting (100 req/min per IP via `@fastify/rate-limit`).
  - CORS support via `@fastify/cors`.
  - Resource blocking (images, fonts, media by default).
  - Session isolation via separate BrowserContexts.
  - Request timeout (30s default, returns 504).

- **Error handling:** Six typed error classes (`SessionNotFound`, `SessionLimit`, `NavigationFailed`, `ActionFailed`, `ValidationError`, `DomainNotAllowed`) with consistent JSON error responses.

- **Session management:** Auto-cleanup on 5-minute idle timeout (30-second check interval), configurable max concurrent sessions (default 10), graceful shutdown on SIGINT/SIGTERM.

- **Firefox as default browser:** ~30-40% less memory than Chromium at idle. Configurable via `STEER_BROWSER` environment variable.

- **Test suite:**
  - 72 unit tests covering configuration, errors, sanitization, retry logic, and CLI.
  - 15+ integration tests covering the full API lifecycle with local HTML fixtures.

- **Documentation:**
  - `README.md` -- user guide with setup, API reference, examples, configuration, and Docker instructions.
  - `ARCHITECTURE.md` -- technical deep-dive with system diagrams, algorithms, and design decisions.
  - `ROADMAP.md` -- planned features and known gaps.
  - `CLAUDE.md` -- project instructions for AI assistants.
  - `LICENSE` -- MIT license.

---

[1.2.0]: https://github.com/enderekici/steer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/enderekici/steer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/enderekici/steer/releases/tag/v1.0.0
