/**
 * Tests for MCP HTTP server (src/mcp/server.ts startHttp method).
 * Tests the HTTP server endpoints: /health, /mcp, 404.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/browser/engine.js', () => {
  class MockBrowserEngine {
    launch = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    getBrowser = vi.fn();
  }
  return { BrowserEngine: MockBrowserEngine };
});

vi.mock('../../src/browser/session-manager.js', () => {
  class MockSessionManager {
    createSession = vi.fn().mockResolvedValue({
      id: 'test-session',
      page: {
        url: vi.fn().mockReturnValue('about:blank'),
        title: vi.fn().mockResolvedValue('Test'),
      },
      refs: new Map(),
      touch: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    });
    getSession = vi.fn();
    destroyAll = vi.fn().mockResolvedValue(undefined);
    stopCleanup = vi.fn();
    listSessions = vi.fn().mockReturnValue([]);
  }
  return { SessionManager: MockSessionManager };
});

vi.mock('../../src/actions/index.js', () => ({
  executeAction: vi.fn(),
  executeNavigate: vi.fn(),
}));

vi.mock('../../src/processing/snapshot.js', () => ({
  takeSnapshot: vi.fn().mockResolvedValue({
    snapshot: { url: '', title: '', refs: [] },
    refMap: new Map(),
  }),
  formatSnapshot: vi.fn().mockReturnValue('snapshot'),
}));

vi.mock('../../src/processing/content.js', () => ({
  extractContent: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  class MockServer {
    setRequestHandler = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { Server: MockServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  class MockStdioServerTransport {}
  return { StdioServerTransport: MockStdioServerTransport };
});

// Track created transports so tests can inspect/manipulate them
const createdTransports: any[] = [];

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  class MockStreamableHTTPServerTransport {
    sessionId: string | null = null;
    onclose: (() => void) | null = null;
    private onsessioninitialized: ((id: string) => void) | null = null;

    constructor(opts: any) {
      if (opts?.sessionIdGenerator) {
        this.sessionId = opts.sessionIdGenerator();
      }
      if (opts?.onsessioninitialized) {
        this.onsessioninitialized = opts.onsessioninitialized;
        // Simulate session initialization
        setTimeout(() => {
          if (this.onsessioninitialized && this.sessionId) {
            this.onsessioninitialized(this.sessionId);
          }
        }, 0);
      }
      createdTransports.push(this);
    }

    handleRequest = vi.fn().mockImplementation((_req: any, res: any) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }
  return { StreamableHTTPServerTransport: MockStreamableHTTPServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
}));

import { McpBrowserServer } from '../../src/mcp/server.js';

function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
      })
      .on('error', reject);
  });
}

function httpRequest(
  url: string,
  method: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () =>
          resolve({ statusCode: res.statusCode!, body: responseBody, headers: res.headers }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('MCP HTTP server', () => {
  let server: McpBrowserServer;
  let httpServer: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = new McpBrowserServer();
    httpServer = await server.startHttp(0, '127.0.0.1'); // Port 0 = random
    const addr = httpServer.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    httpServer.close();
    await server.stop();
  });

  it('should respond to /health GET', async () => {
    const { statusCode, body } = await httpGet(`${baseUrl}/health`);
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.status).toBe('ok');
    expect(parsed.transport).toBe('streamable-http');
  });

  it('should respond with 404 for unknown paths', async () => {
    const { statusCode, body } = await httpGet(`${baseUrl}/unknown`);
    expect(statusCode).toBe(404);
    const parsed = JSON.parse(body);
    expect(parsed.error).toBe('Not found');
  });

  it('should respond with CORS headers on OPTIONS /mcp', async () => {
    const { statusCode, headers } = await httpRequest(`${baseUrl}/mcp`, 'OPTIONS');
    expect(statusCode).toBe(204);
    expect(headers['access-control-allow-origin']).toBe('http://localhost:*');
    expect(headers['access-control-allow-methods']).toContain('POST');
  });

  it('should create transport for POST /mcp without session', async () => {
    const { statusCode } = await httpRequest(
      `${baseUrl}/mcp`,
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    );
    // The mock transport handles the request
    expect(statusCode).toBe(200);
  });

  it('should return 400 for GET /mcp without session', async () => {
    const { statusCode, body } = await httpGet(`${baseUrl}/mcp`);
    expect(statusCode).toBe(400);
    const parsed = JSON.parse(body);
    expect(parsed.error).toContain('No valid session');
  });

  it('should reuse transport for POST /mcp with existing session ID', async () => {
    // First POST creates a transport
    const firstResult = await httpRequest(
      `${baseUrl}/mcp`,
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    );
    expect(firstResult.statusCode).toBe(200);

    // Wait for onsessioninitialized callback
    await new Promise((r) => setTimeout(r, 50));

    // The mock transport should have a sessionId
    const transport = createdTransports[createdTransports.length - 1];
    expect(transport.sessionId).toBeTruthy();

    // Second POST with the same session ID should reuse transport
    const secondResult = await httpRequest(
      `${baseUrl}/mcp`,
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
      { 'mcp-session-id': transport.sessionId },
    );
    expect(secondResult.statusCode).toBe(200);
  });

  it('should handle DELETE /mcp with session', async () => {
    // Create transport first
    await httpRequest(
      `${baseUrl}/mcp`,
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    );
    await new Promise((r) => setTimeout(r, 50));

    const transport = createdTransports[createdTransports.length - 1];

    const { statusCode } = await httpRequest(`${baseUrl}/mcp`, 'DELETE', undefined, {
      'mcp-session-id': transport.sessionId,
    });
    // The mock transport handles the request
    expect(statusCode).toBe(200);
  });

  it('should handle onclose callback on transport', async () => {
    await httpRequest(
      `${baseUrl}/mcp`,
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    );
    await new Promise((r) => setTimeout(r, 50));

    const transport = createdTransports[createdTransports.length - 1];

    // Trigger onclose if set
    if (transport.onclose) {
      transport.onclose();
    }
    // No crash expected
  });
});
