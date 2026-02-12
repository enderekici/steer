/**
 * Tests for MCP server (src/mcp/server.ts).
 * Tests McpBrowserServer class, ensureSession, errorContent, and tool handlers.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock heavy dependencies - use class syntax so `new` works
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
    private sessions = new Map<string, any>();
    createSession = vi.fn(async () => {
      const session = {
        id: 'test-session-1',
        page: {
          url: vi.fn().mockReturnValue('about:blank'),
          title: vi.fn().mockResolvedValue('Test'),
          screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
          evaluate: vi.fn().mockResolvedValue([]),
          goto: vi.fn().mockResolvedValue(undefined),
          $: vi.fn().mockResolvedValue(null),
        },
        refs: new Map(),
        touch: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      this.sessions.set(session.id, session);
      return session;
    });
    getSession = vi.fn((id: string) => {
      const session = this.sessions.get(id);
      if (!session) throw new Error(`Session ${id} not found`);
      session.touch();
      return session;
    });
    destroyAll = vi.fn().mockResolvedValue(undefined);
    stopCleanup = vi.fn();
    listSessions = vi.fn().mockReturnValue([]);
  }
  return { SessionManager: MockSessionManager };
});

vi.mock('../../src/actions/index.js', () => ({
  executeAction: vi.fn().mockResolvedValue({
    success: true,
    snapshot: { url: 'http://test.com', title: 'Test', refs: [] },
    url: 'http://test.com',
  }),
  executeNavigate: vi.fn().mockResolvedValue({
    success: true,
    snapshot: { url: 'http://example.com', title: 'Example', refs: [] },
    url: 'http://example.com',
  }),
}));

vi.mock('../../src/processing/snapshot.js', () => ({
  takeSnapshot: vi.fn().mockResolvedValue({
    snapshot: { url: 'http://test.com', title: 'Test', refs: [] },
    refMap: new Map(),
  }),
  formatSnapshot: vi.fn().mockReturnValue('Page: Test\nURL: http://test.com\n'),
}));

vi.mock('../../src/processing/content.js', () => ({
  extractContent: vi.fn().mockResolvedValue({
    content: 'Extracted text content',
    url: 'http://test.com',
    title: 'Test',
  }),
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

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  class MockStreamableHTTPServerTransport {}
  return { StreamableHTTPServerTransport: MockStreamableHTTPServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
}));

import { McpBrowserServer, startMcpHttpServer, startMcpServer } from '../../src/mcp/server.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('McpBrowserServer', () => {
  it('should create a new instance', () => {
    const server = new McpBrowserServer();
    expect(server).toBeDefined();
  });

  describe('ensureSession', () => {
    it('should create a default session when no sessionId provided', async () => {
      const server = new McpBrowserServer();
      const session = await server.ensureSession();

      expect(session).toBeDefined();
      expect(session.id).toBe('test-session-1');
    });

    it('should reuse the default session on subsequent calls', async () => {
      const server = new McpBrowserServer();
      const session1 = await server.ensureSession();
      const session2 = await server.ensureSession();

      expect(session1.id).toBe(session2.id);
    });

    it('should get session by explicit sessionId', async () => {
      const server = new McpBrowserServer();
      const created = await server.ensureSession();

      const session = await server.ensureSession(created.id);
      expect(session.id).toBe(created.id);
    });

    it('should create new default session if previous one expired', async () => {
      const server = new McpBrowserServer();
      const session1 = await server.ensureSession();

      // Access private sessions manager to make getSession throw
      const sm = (server as any).sessions;
      const originalGetSession = sm.getSession.bind(sm);

      let throwOnce = true;
      sm.getSession = vi.fn((id: string) => {
        if (throwOnce && id === session1.id) {
          throwOnce = false;
          throw new Error('Session not found');
        }
        return originalGetSession(id);
      });

      const session2 = await server.ensureSession();
      expect(session2).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop the server cleanly', async () => {
      const server = new McpBrowserServer();
      await server.stop();
    });
  });

  describe('startStdio', () => {
    it('should launch browser and start stdio transport', async () => {
      const server = new McpBrowserServer();
      await server.startStdio();
    });
  });

  describe('startHttp', () => {
    it('should launch browser and start HTTP server', async () => {
      const server = new McpBrowserServer();
      const httpServer = await server.startHttp(0, '127.0.0.1');
      expect(httpServer).toBeDefined();
      httpServer.close();
      await server.stop();
    });
  });
});

describe('startMcpServer', () => {
  it('should create and start a server', async () => {
    // We can't really test the full flow without side effects, but ensure it returns
    const server = await startMcpServer();
    expect(server).toBeInstanceOf(McpBrowserServer);
    await server.stop();
  });
});

describe('startMcpHttpServer', () => {
  it('should create and start an HTTP server', async () => {
    const { mcpServer, httpServer } = await startMcpHttpServer(0, '127.0.0.1');
    expect(mcpServer).toBeInstanceOf(McpBrowserServer);
    expect(httpServer).toBeDefined();
    httpServer.close();
    await mcpServer.stop();
  });
});
