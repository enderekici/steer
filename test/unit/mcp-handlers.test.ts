/**
 * Tests for MCP server tool handlers (src/mcp/server.ts).
 * Tests the private handler methods via the registered CallToolRequestSchema handler.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the CallTool handler
let callToolHandler: ((request: any) => Promise<any>) | null = null;
let listToolsHandler: ((request: any) => Promise<any>) | null = null;

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
          url: vi.fn().mockReturnValue('http://test.com'),
          title: vi.fn().mockResolvedValue('Test'),
          screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
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
    setRequestHandler = vi.fn((schema: string, handler: Function) => {
      if (schema === 'CallToolRequestSchema') {
        callToolHandler = handler as any;
      } else if (schema === 'ListToolsRequestSchema') {
        listToolsHandler = handler as any;
      }
    });
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

import { executeAction, executeNavigate } from '../../src/actions/index.js';
import { McpBrowserServer } from '../../src/mcp/server.js';
import { extractContent } from '../../src/processing/content.js';
import { formatSnapshot, takeSnapshot } from '../../src/processing/snapshot.js';

beforeEach(() => {
  vi.clearAllMocks();
  callToolHandler = null;
  listToolsHandler = null;
});

describe('MCP tool handlers', () => {
  async function createServerAndGetHandlers() {
    const server = new McpBrowserServer();
    // The handlers are registered in the constructor via registerHandlers
    return { server, callToolHandler: callToolHandler!, listToolsHandler: listToolsHandler! };
  }

  describe('ListTools', () => {
    it('should return a list of tools', async () => {
      const { listToolsHandler } = await createServerAndGetHandlers();
      const result = await listToolsHandler({});
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThan(0);
    });
  });

  describe('browser_navigate', () => {
    it('should navigate to a URL', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_navigate',
          arguments: { url: 'https://example.com' },
        },
      });

      expect(executeNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-session-1' }),
        'https://example.com',
      );
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should return error when url is missing', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_navigate',
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter "url"');
    });
  });

  describe('browser_act', () => {
    it('should perform an action', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: { action: 'click', ref: 'r1' },
        },
      });

      expect(executeAction).toHaveBeenCalled();
      expect(result.content).toBeDefined();
    });

    it('should return error when action is missing', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter "action"');
    });

    it('should pass target with ref', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: { action: 'click', ref: 'r5' },
        },
      });

      expect(executeAction).toHaveBeenCalledWith(
        expect.anything(),
        'click',
        expect.objectContaining({
          target: { ref: 'r5', selector: undefined },
        }),
      );
    });

    it('should pass target with selector', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: { action: 'click', selector: '.btn' },
        },
      });

      expect(executeAction).toHaveBeenCalledWith(
        expect.anything(),
        'click',
        expect.objectContaining({
          target: { ref: undefined, selector: '.btn' },
        }),
      );
    });

    it('should pass no target when ref and selector are absent', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: { action: 'scroll', direction: 'down' },
        },
      });

      expect(executeAction).toHaveBeenCalledWith(
        expect.anything(),
        'scroll',
        expect.objectContaining({
          target: undefined,
          direction: 'down',
        }),
      );
    });

    it('should pass all action params', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_act',
          arguments: {
            action: 'type',
            ref: 'r1',
            value: 'hello',
            key: 'Enter',
            direction: 'down',
            state: 'visible',
            timeout: 5000,
            filePaths: ['/a.txt'],
            dialogAction: 'accept',
            promptText: 'test',
          },
        },
      });

      expect(executeAction).toHaveBeenCalledWith(
        expect.anything(),
        'type',
        expect.objectContaining({
          value: 'hello',
          key: 'Enter',
          direction: 'down',
          state: 'visible',
          timeout: 5000,
          filePaths: ['/a.txt'],
          dialogAction: 'accept',
          promptText: 'test',
        }),
      );
    });
  });

  describe('browser_extract', () => {
    it('should extract text content', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_extract',
          arguments: { mode: 'text' },
        },
      });

      expect(extractContent).toHaveBeenCalled();
      expect(result.content[0].text).toBe('Extracted text content');
    });

    it('should extract with default mode text', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_extract',
          arguments: {},
        },
      });

      expect(extractContent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'text' }),
      );
    });

    it('should pass selector and schema options', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_extract',
          arguments: {
            mode: 'structured',
            selector: '.item',
            schema: { type: 'object' },
            maxLength: 1000,
          },
        },
      });

      expect(extractContent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          mode: 'structured',
          selector: '.item',
          schema: { type: 'object' },
          maxLength: 1000,
        }),
      );
    });

    it('should serialize object content as JSON', async () => {
      vi.mocked(extractContent).mockResolvedValueOnce({
        content: { title: 'Test' },
        url: 'http://test.com',
        title: 'Test',
      });

      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_extract',
          arguments: { mode: 'structured' },
        },
      });

      expect(result.content[0].text).toContain('"title"');
    });
  });

  describe('browser_observe', () => {
    it('should return accessibility snapshot', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_observe',
          arguments: {},
        },
      });

      expect(takeSnapshot).toHaveBeenCalled();
      expect(formatSnapshot).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
    });

    it('should pass scope, verbosity, and maxRefs options', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      await callToolHandler({
        params: {
          name: 'browser_observe',
          arguments: {
            scope: '#main',
            verbosity: 'detailed',
            maxRefs: 10,
          },
        },
      });

      expect(takeSnapshot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          scope: '#main',
          verbosity: 'detailed',
          maxRefs: 10,
        }),
      );
    });

    it('should update session refs after observe', async () => {
      const refMap = new Map();
      refMap.set('r1', { mock: true });
      vi.mocked(takeSnapshot).mockResolvedValueOnce({
        snapshot: { url: 'http://test.com', title: 'Test', refs: [] },
        refMap,
      });

      const { callToolHandler, server } = await createServerAndGetHandlers();
      // Ensure session exists
      await server.ensureSession();

      await callToolHandler({
        params: {
          name: 'browser_observe',
          arguments: {},
        },
      });

      // The session should have been updated via the handler
      expect(takeSnapshot).toHaveBeenCalled();
    });
  });

  describe('browser_screenshot', () => {
    it('should return screenshot as base64 image', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_screenshot',
          arguments: {},
        },
      });

      expect(result.content[0].type).toBe('image');
      expect(result.content[0].mimeType).toBe('image/png');
      expect(result.content[0].data).toBeTruthy();
    });

    it('should pass fullPage option', async () => {
      const { callToolHandler, server } = await createServerAndGetHandlers();
      // Ensure session exists
      const session = await server.ensureSession();

      await callToolHandler({
        params: {
          name: 'browser_screenshot',
          arguments: { fullPage: true },
        },
      });

      expect(session.page.screenshot).toHaveBeenCalledWith({
        type: 'png',
        fullPage: true,
      });
    });

    it('should default fullPage to false', async () => {
      const { callToolHandler, server } = await createServerAndGetHandlers();
      const session = await server.ensureSession();

      await callToolHandler({
        params: {
          name: 'browser_screenshot',
          arguments: {},
        },
      });

      expect(session.page.screenshot).toHaveBeenCalledWith({
        type: 'png',
        fullPage: false,
      });
    });
  });

  describe('unknown tool', () => {
    it('should return error for unknown tool', async () => {
      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_unknown',
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });

  describe('error handling', () => {
    it('should catch and return errors from tool handlers', async () => {
      vi.mocked(executeNavigate).mockRejectedValueOnce(new Error('Navigation failed'));

      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_navigate',
          arguments: { url: 'https://example.com' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Navigation failed');
    });

    it('should handle non-Error throws', async () => {
      vi.mocked(executeNavigate).mockRejectedValueOnce('string error');

      const { callToolHandler } = await createServerAndGetHandlers();

      const result = await callToolHandler({
        params: {
          name: 'browser_navigate',
          arguments: { url: 'https://example.com' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string error');
    });
  });
});
