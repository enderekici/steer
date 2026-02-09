/**
 * MCP server for abbwak — exposes browser primitives as MCP tools
 * for use with Claude Desktop, Cursor, and other MCP-compatible clients.
 *
 * Run standalone:  npx tsx src/mcp/server.ts
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { executeAction, executeNavigate } from '../actions/index.js';
import type { ActionTarget } from '../actions/index.js';
import { BrowserEngine } from '../browser/engine.js';
import { SessionManager } from '../browser/session-manager.js';
import type { Session } from '../browser/session.js';
import { extractContent } from '../processing/content.js';
import type { ExtractOptions } from '../processing/content.js';
import { formatSnapshot, takeSnapshot } from '../processing/snapshot.js';
import { logger } from '../utils/logger.js';
import { TOOLS } from './tools.js';

// ---------------------------------------------------------------------------
// Server class
// ---------------------------------------------------------------------------

export class McpBrowserServer {
  private server: Server;
  private engine: BrowserEngine;
  private sessions: SessionManager;
  private defaultSessionId: string | null = null;

  constructor() {
    this.engine = new BrowserEngine();
    this.sessions = new SessionManager(this.engine);

    this.server = new Server({ name: 'abbwak', version: '1.0.0' }, { capabilities: { tools: {} } });

    this.registerHandlers();
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  private registerHandlers(): void {
    this.registerHandlersOn(this.server);
  }

  private registerHandlersOn(target: Server): void {
    // List available tools
    target.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...TOOLS],
    }));

    // Execute a tool
    target.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<Record<string, unknown>> => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case 'browser_navigate':
              return (await this.handleNavigate(args)) as Record<string, unknown>;
            case 'browser_act':
              return (await this.handleAct(args)) as Record<string, unknown>;
            case 'browser_extract':
              return (await this.handleExtract(args)) as Record<string, unknown>;
            case 'browser_observe':
              return (await this.handleObserve(args)) as Record<string, unknown>;
            case 'browser_screenshot':
              return (await this.handleScreenshot(args)) as Record<string, unknown>;
            default:
              return errorContent(`Unknown tool: ${name}`) as Record<string, unknown>;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ tool: name, err }, 'MCP tool error');
          return errorContent(message) as Record<string, unknown>;
        }
      },
    );
  }

  // ── Tool handlers ───────────────────────────────────────────────────────

  private async handleNavigate(args: Record<string, unknown> = {}): Promise<ToolResponse> {
    const session = await this.ensureSession(args.sessionId as string | undefined);
    const url = args.url as string;

    if (!url) {
      return errorContent('Missing required parameter "url"');
    }

    const result = await executeNavigate(session, url);
    const text = formatSnapshot(result.snapshot);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleAct(args: Record<string, unknown> = {}): Promise<ToolResponse> {
    const session = await this.ensureSession(args.sessionId as string | undefined);
    const action = args.action as string;

    if (!action) {
      return errorContent('Missing required parameter "action"');
    }

    const target: ActionTarget | undefined =
      args.ref || args.selector
        ? {
            ref: args.ref as string | undefined,
            selector: args.selector as string | undefined,
          }
        : undefined;

    const result = await executeAction(session, action, {
      target,
      value: args.value as string | undefined,
      direction: args.direction as 'up' | 'down' | 'left' | 'right' | undefined,
      selector: args.selector as string | undefined,
      state: args.state as 'visible' | 'hidden' | 'attached' | 'detached' | undefined,
      timeout: args.timeout as number | undefined,
      key: args.key as string | undefined,
      filePaths: args.filePaths as string[] | undefined,
      dialogAction: args.dialogAction as 'accept' | 'dismiss' | undefined,
      promptText: args.promptText as string | undefined,
    });

    const text = formatSnapshot(result.snapshot);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleExtract(args: Record<string, unknown> = {}): Promise<ToolResponse> {
    const session = await this.ensureSession(args.sessionId as string | undefined);

    const options: ExtractOptions = {
      mode: (args.mode as ExtractOptions['mode']) ?? 'text',
      selector: args.selector as string | undefined,
      schema: args.schema as ExtractOptions['schema'],
      maxLength: args.maxLength as number | undefined,
    };

    const result = await extractContent(session.page, options);

    const text =
      typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleObserve(args: Record<string, unknown> = {}): Promise<ToolResponse> {
    const session = await this.ensureSession(args.sessionId as string | undefined);

    const { snapshot, refMap } = await takeSnapshot(session.page, {
      scope: args.scope as string | undefined,
      verbosity: (args.verbosity as 'minimal' | 'normal' | 'detailed') ?? 'normal',
      maxRefs: args.maxRefs as number | undefined,
    });

    // Update session refs so subsequent act calls can resolve ref IDs.
    session.refs.clear();
    for (const [key, handle] of refMap) {
      session.refs.set(key, handle);
    }
    session.touch();

    const text = formatSnapshot(snapshot);

    return {
      content: [{ type: 'text', text }],
    };
  }

  private async handleScreenshot(args: Record<string, unknown> = {}): Promise<ToolResponse> {
    const session = await this.ensureSession(args.sessionId as string | undefined);
    const fullPage = (args.fullPage as boolean) ?? false;

    const buffer = await session.page.screenshot({
      type: 'png',
      fullPage,
    });

    const base64 = buffer.toString('base64');

    return {
      content: [
        {
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        },
      ],
    };
  }

  // ── Session management ──────────────────────────────────────────────────

  /**
   * Get or create the session for the given ID.
   * When no sessionId is provided, a default session is created on first use
   * and reused for the lifetime of this MCP server instance.
   */
  async ensureSession(sessionId?: string): Promise<Session> {
    if (sessionId) {
      return this.sessions.getSession(sessionId);
    }

    // Default session: create once, reuse thereafter.
    if (this.defaultSessionId) {
      try {
        return this.sessions.getSession(this.defaultSessionId);
      } catch {
        // Session was cleaned up (e.g. expired). Create a fresh one.
        logger.info('Default session expired, creating a new one');
        this.defaultSessionId = null;
      }
    }

    const session = await this.sessions.createSession();
    this.defaultSessionId = session.id;
    logger.info({ sessionId: session.id }, 'Default MCP session created');
    return session;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async startStdio(): Promise<void> {
    await this.engine.launch({ headless: true });
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started (stdio transport)');
  }

  async startHttp(port: number, host: string): Promise<http.Server> {
    await this.engine.launch({ headless: true });

    const transports = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Health check
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', transport: 'streamable-http' }));
        return;
      }

      // MCP endpoint
      if (url.pathname === '/mcp') {
        // CORS headers for browser-based clients
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Look up existing session transport
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport = sessionId ? transports.get(sessionId) : undefined;

        // New session: create transport + connect a fresh MCP server
        if (!transport && req.method === 'POST') {
          const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              transports.set(id, newTransport);
              logger.info({ sessionId: id }, 'MCP HTTP session created');
            },
          });

          newTransport.onclose = () => {
            const id = newTransport.sessionId;
            if (id) transports.delete(id);
            logger.info({ sessionId: id }, 'MCP HTTP session closed');
          };

          transport = newTransport;

          // Each HTTP session gets its own MCP Server + handlers
          const sessionServer = new Server(
            { name: 'abbwak', version: '1.0.0' },
            { capabilities: { tools: {} } },
          );
          this.registerHandlersOn(sessionServer);
          await sessionServer.connect(transport);
        }

        if (!transport) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No valid session. Send a POST to initialize.' }));
          return;
        }

        // Parse body for POST requests
        let body: unknown;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          body = JSON.parse(Buffer.concat(chunks).toString());
        }

        await transport.handleRequest(req, res, body);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    return new Promise((resolve) => {
      httpServer.listen(port, host, () => {
        logger.info({ port, host }, 'MCP server started (Streamable HTTP transport)');
        resolve(httpServer);
      });
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping MCP server');
    this.sessions.stopCleanup();
    await this.sessions.destroyAll();
    await this.engine.close();
    await this.server.close();
    logger.info('MCP server stopped');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ToolResponse {
  [key: string]: unknown;
  content: Array<
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}

function errorContent(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function startMcpServer(): Promise<McpBrowserServer> {
  const server = new McpBrowserServer();

  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.startStdio();
  return server;
}

export async function startMcpHttpServer(
  port: number,
  host: string,
): Promise<{ mcpServer: McpBrowserServer; httpServer: http.Server }> {
  const mcpServer = new McpBrowserServer();

  const shutdown = async () => {
    httpServer.close();
    await mcpServer.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const httpServer = await mcpServer.startHttp(port, host);
  return { mcpServer, httpServer };
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/mcp/server.ts') ||
  process.argv[1]?.endsWith('/mcp/server.js');

if (isMain) {
  startMcpServer().catch((err) => {
    logger.error({ err }, 'Failed to start MCP server');
    process.exit(1);
  });
}
