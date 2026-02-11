# Docker Deployment

Guide to building, running, and configuring steer with Docker.

---

## Prerequisites

- Docker 20.10+ (or Docker Desktop)
- Docker Compose v2 (included with Docker Desktop)
- At least 2GB of available memory for the container

---

## Building the Image

```bash
docker build -t steer .
```

The Dockerfile uses a multi-stage build:

1. **Builder stage** (`node:24-slim`): Installs all dependencies and compiles TypeScript to `dist/`.
2. **Production stage** (`mcr.microsoft.com/playwright:v1.58.2-noble`): Copies only `dist/` and production dependencies, installs Firefox only.

This produces a lean image with no TypeScript source, no dev dependencies, and only one browser engine (~400MB savings compared to installing all browsers).

---

## Running with docker run

### REST API server

```bash
docker run -p 3000:3000 steer
```

The server is accessible at `http://localhost:3000`.

### MCP server (HTTP transport)

```bash
docker run -d -p 3001:3001 steer node dist/cli.js --mcp-http
```

The MCP endpoint is accessible at `http://localhost:3001/mcp`.

### With environment variables

```bash
docker run -p 3000:3000 \
  -e STEER_MAX_SESSIONS=5 \
  -e STEER_SESSION_TIMEOUT_MS=600000 \
  -e STEER_BROWSER=firefox \
  -e STEER_BLOCK_RESOURCES=image,font,media \
  steer
```

### With resource limits

```bash
docker run -p 3000:3000 \
  --memory=2g \
  --cpus=2.0 \
  steer
```

---

## Running with Docker Compose

The `docker-compose.yml` defines two services:

| Service | Description | Port |
|---------|-------------|------|
| `steer` | REST API server | 3000 |
| `steer-mcp` | MCP server (Streamable HTTP transport) | 3001 |

### Start the REST API server

```bash
docker compose up steer           # foreground
docker compose up -d steer        # detached
```

### Start the MCP server

```bash
docker compose up steer-mcp       # foreground
docker compose up -d steer-mcp    # detached
```

### Start both services

```bash
docker compose up -d
```

### Stop all services

```bash
docker compose down
```

### Rebuild after code changes

```bash
docker compose build
docker compose up -d
```

---

## Environment Variables

All configuration is done through environment variables. Set them in `docker-compose.yml` under the `environment` key, or pass them with `-e` to `docker run`.

| Variable | Default | Description |
|----------|---------|-------------|
| `STEER_PORT` | `3000` | HTTP server port |
| `STEER_HOST` | `0.0.0.0` | HTTP server bind address |
| `STEER_MAX_SESSIONS` | `10` | Maximum concurrent browser sessions |
| `STEER_SESSION_TIMEOUT_MS` | `300000` | Session idle timeout in ms (5 min) |
| `STEER_REQUEST_TIMEOUT_MS` | `30000` | HTTP request timeout in ms (30s) |
| `STEER_HEADLESS` | `true` | Run browser in headless mode |
| `STEER_BROWSER` | `firefox` | Browser engine: `chromium`, `firefox`, `webkit` |
| `STEER_BLOCK_RESOURCES` | `image,font,media` | Comma-separated resource types to block |
| `STEER_ALLOWED_DOMAINS` | (empty) | Comma-separated domain allowlist (empty = all) |
| `STEER_VIEWPORT_WIDTH` | `1280` | Default viewport width |
| `STEER_VIEWPORT_HEIGHT` | `720` | Default viewport height |
| `STEER_EXECUTABLE_PATH` | (auto) | Custom browser executable path |
| `STEER_MCP_PORT` | `3001` | MCP HTTP server port |
| `STEER_LOG_LEVEL` | `info` | Log level: `silent`, `debug`, `info`, `warn`, `error` |

### Domain allowlist example

To restrict browsing to specific domains:

```yaml
environment:
  - STEER_ALLOWED_DOMAINS=github.com,google.com,docs.python.org
```

Any navigation to an unlisted domain will return a 403 error.

---

## Resource Limits and Tuning

### Memory

The Docker Compose file sets:
- **Limit**: 2GB (`memory: 2g`)
- **Reservation**: 512MB (`memory: 512m`)

Firefox uses approximately 120MB at idle. Each active session with a loaded page adds 50-150MB depending on page complexity. For 10 concurrent sessions, 2GB is the recommended minimum.

| Sessions | Recommended Memory |
|----------|-------------------|
| 1-3 | 512MB |
| 4-6 | 1GB |
| 7-10 | 2GB |
| 10+ | 4GB+ |

### CPU

The Docker Compose file sets:
- **Limit**: 2.0 CPUs
- **Reservation**: 0.5 CPUs

Browser rendering is CPU-intensive. Reduce `STEER_MAX_SESSIONS` if running on a single-core host.

### Adjusting limits

In `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 4g
      cpus: '4.0'
    reservations:
      memory: 1g
      cpus: '1.0'
```

Or with `docker run`:

```bash
docker run -p 3000:3000 --memory=4g --cpus=4.0 steer
```

---

## Security Features

### Non-root user

The container creates a dedicated `steer` user (UID 1001, GID 1001) and runs the application as that user. The application never runs as root.

### Read-only filesystem

The Docker Compose configuration enables `read_only: true`, preventing the container from writing to the filesystem. A tmpfs mount at `/tmp` provides temporary storage:

```yaml
read_only: true
tmpfs:
  - /tmp:noexec,nosuid,size=64m
```

### No new privileges

The `no-new-privileges` security option prevents processes inside the container from gaining additional privileges:

```yaml
security_opt:
  - no-new-privileges:true
```

### Log rotation

Container logs are limited to 10MB per file with a maximum of 3 files:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Browser sandboxing

The browser runs with `--no-sandbox` inside the container, which is standard practice for containerized Chromium/Firefox. The container itself provides the isolation boundary.

---

## Health Checks

### REST API service

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"
```

### MCP service

The MCP service in Docker Compose has its own health check:

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)throw 1})"]
  interval: 30s
  timeout: 5s
  retries: 3
```

### Manual health check

```bash
curl http://localhost:3000/health
```

Response:

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

---

## Connecting MCP to Claude Desktop

### Step 1: Start the MCP container

```bash
docker compose up -d steer-mcp
```

Verify it is running:

```bash
curl http://localhost:3001/health
```

### Step 2: Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "steer": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Step 3: Restart Claude Desktop

Restart the application. The steer browser tools (`browser_navigate`, `browser_act`, `browser_extract`, `browser_observe`, `browser_screenshot`) will appear automatically.

---

## Connecting MCP to Claude Code

Add the following to `.claude/settings.json` (project-level) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "steer": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Claude Code connects over HTTP to the running container. No stdio pipe is needed.

---

## MCP Transport Modes

steer supports two MCP transport modes:

| Mode | CLI flag | Protocol | Use case |
|------|----------|----------|----------|
| stdio | `--mcp` | JSON-RPC over stdin/stdout | Local: client launches steer as a subprocess |
| HTTP | `--mcp-http` | MCP Streamable HTTP | Docker/remote: long-lived server, clients connect over HTTP |

The Docker setup uses the HTTP transport. It supports multiple concurrent MCP client sessions, each with their own isolated browser sessions.

---

## Volumes

The Docker Compose file defines a named volume for browser profiles:

```yaml
volumes:
  steer-profiles:
```

This volume is mounted at `/app/profiles` and can be used for future persistent browser profile storage.

---

## Troubleshooting

### Container exits immediately

Check the container logs:

```bash
docker compose logs steer
docker logs <container-id>
```

Common causes:
- Port already in use (another process on port 3000 or 3001)
- Insufficient memory (browser fails to launch)

### Browser fails to launch

If the browser cannot start, verify the container has enough memory:

```bash
docker stats
```

Increase the memory limit if the container is hitting its cap. Firefox needs at least 256MB to launch.

### Health check failing

If the health check fails repeatedly, the container may be restarting in a loop. Check logs:

```bash
docker compose logs --tail=50 steer
```

If the server is taking too long to start, the health check may fire before it is ready. Increase the start period:

```yaml
healthcheck:
  start_period: 30s
```

### Pages not loading

If navigation times out or returns errors:

1. Verify the container has network access to the target domain.
2. Check if `STEER_ALLOWED_DOMAINS` is set and restricting the domain.
3. Verify DNS resolution works inside the container.

### Session limit reached

If you receive a 429 error ("Session limit reached"), either:
- Increase `STEER_MAX_SESSIONS` in the environment configuration.
- Delete unused sessions via `DELETE /sessions/:id`.
- Reduce `STEER_SESSION_TIMEOUT_MS` to clean up idle sessions faster.

### High memory usage

Each browser session consumes 50-150MB. To reduce memory usage:
- Lower `STEER_MAX_SESSIONS`.
- Keep `STEER_BLOCK_RESOURCES=image,font,media` (the default) to reduce page weight.
- Use Firefox (default) instead of Chromium, which uses ~30-40% less memory.
- Reduce `STEER_SESSION_TIMEOUT_MS` to expire idle sessions sooner.

### Port conflicts

If port 3000 or 3001 is already in use, map to a different host port:

```bash
docker run -p 8080:3000 steer
```

Or update `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"
```

### Building on ARM (Apple Silicon)

The Playwright base image supports both `amd64` and `arm64` architectures. The build should work natively on Apple Silicon Macs without emulation.
