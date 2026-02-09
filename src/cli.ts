#!/usr/bin/env node

/**
 * CLI entry point for steer.
 *
 * Usage:
 *   npx steer              # Start the REST API server
 *   npx steer --mcp        # Start the MCP server (stdio transport)
 *   npx steer --mcp-http   # Start the MCP server (HTTP transport)
 *   npx steer --help       # Show help
 */

export {};

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    `
steer — API-Based Browser Without API Key

Usage:
  steer              Start the REST API server (default: http://0.0.0.0:3000)
  steer --mcp        Start the MCP server (stdio transport, for Claude Desktop)
  steer --mcp-http   Start the MCP server (HTTP transport, for Docker / remote)
  steer --help       Show this help message

Environment variables:
  STEER_PORT               Server port (default: 3000)
  STEER_HOST               Server host (default: 0.0.0.0)
  STEER_MCP_PORT           MCP HTTP server port (default: 3001)
  STEER_MAX_SESSIONS       Max concurrent sessions (default: 10)
  STEER_SESSION_TIMEOUT_MS Session idle timeout in ms (default: 300000)
  STEER_REQUEST_TIMEOUT_MS Request timeout in ms (default: 30000)
  STEER_HEADLESS           Run browser headless (default: true)
  STEER_BROWSER            Browser engine: chromium|firefox|webkit (default: firefox)
  STEER_BLOCK_RESOURCES    Comma-separated resource types to block (default: image,font,media)
  STEER_ALLOWED_DOMAINS    Comma-separated domain allowlist (default: all)
  STEER_EXECUTABLE_PATH    Custom browser executable path
  STEER_LOG_LEVEL          Log level: silent|debug|info|warn|error (default: info)

MCP setup (Claude Desktop — stdio):
  {
    "mcpServers": {
      "steer": {
        "command": "npx",
        "args": ["steer", "--mcp"]
      }
    }
  }

MCP setup (Claude Desktop — Docker HTTP):
  {
    "mcpServers": {
      "steer": {
        "url": "http://localhost:3001/mcp"
      }
    }
  }
`.trim(),
  );
  process.exit(0);
}

if (args.includes('--mcp-http')) {
  // MCP HTTP mode: Streamable HTTP transport (for Docker / remote)
  const { startMcpHttpServer } = await import('./mcp/server.js');
  const port = Number.parseInt(process.env.STEER_MCP_PORT || '3001', 10);
  const host = process.env.STEER_HOST || '0.0.0.0';
  await startMcpHttpServer(port, host);
} else if (args.includes('--mcp')) {
  // MCP stdio mode: for local Claude Desktop
  const { startMcpServer } = await import('./mcp/server.js');
  await startMcpServer();
} else {
  // REST API mode: import and run the HTTP server
  await import('./index.js');
}
