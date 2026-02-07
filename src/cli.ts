#!/usr/bin/env node

/**
 * CLI entry point for abbwak.
 *
 * Usage:
 *   npx abbwak              # Start the REST API server
 *   npx abbwak --mcp        # Start the MCP server (stdio transport)
 *   npx abbwak --help       # Show help
 */

export {};

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
abbwak — API-Based Browser Without API Key

Usage:
  abbwak              Start the REST API server (default: http://0.0.0.0:3000)
  abbwak --mcp        Start the MCP server (stdio transport, for Claude Desktop)
  abbwak --help       Show this help message

Environment variables:
  ABBWAK_PORT               Server port (default: 3000)
  ABBWAK_HOST               Server host (default: 0.0.0.0)
  ABBWAK_MAX_SESSIONS       Max concurrent sessions (default: 10)
  ABBWAK_SESSION_TIMEOUT_MS Session idle timeout in ms (default: 300000)
  ABBWAK_REQUEST_TIMEOUT_MS Request timeout in ms (default: 30000)
  ABBWAK_HEADLESS           Run browser headless (default: true)
  ABBWAK_BROWSER            Browser engine: chromium|firefox|webkit (default: firefox)
  ABBWAK_BLOCK_RESOURCES    Comma-separated resource types to block (default: image,font,media)
  ABBWAK_ALLOWED_DOMAINS    Comma-separated domain allowlist (default: all)
  ABBWAK_EXECUTABLE_PATH    Custom browser executable path
  ABBWAK_LOG_LEVEL          Log level: silent|debug|info|warn|error (default: info)

MCP setup (Claude Desktop / claude_desktop_config.json):
  {
    "mcpServers": {
      "abbwak": {
        "command": "npx",
        "args": ["abbwak", "--mcp"]
      }
    }
  }
`.trim());
  process.exit(0);
}

if (args.includes("--mcp")) {
  // MCP mode: import and start the MCP server
  const { startMcpServer } = await import("./mcp/server.js");
  await startMcpServer();
} else {
  // REST API mode: import and run the HTTP server
  await import("./index.js");
}
