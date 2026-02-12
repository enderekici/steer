/**
 * Tests for Session class (src/browser/session.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config.js', () => ({
  config: {
    viewportWidth: 1280,
    viewportHeight: 720,
    blockResources: ['image', 'font'],
  },
}));

import { Session } from '../../src/browser/session.js';

function createMockBrowser() {
  const mockPage = {
    url: vi.fn().mockReturnValue('about:blank'),
  };
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
  };
  return { mockBrowser, mockContext, mockPage };
}

describe('Session', () => {
  describe('create', () => {
    it('should create a session with default options', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastActivity).toBeGreaterThan(0);
    });

    it('should create a session with custom viewport', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any, {
        viewport: { width: 1920, height: 1080 },
      });

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
        }),
      );
      expect(session).toBeDefined();
    });

    it('should inject __name shim via addInitScript', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      await Session.create(mockBrowser as any);

      expect(mockContext.addInitScript).toHaveBeenCalledWith(expect.stringContaining('__name'));
    });

    it('should set up resource blocking when blockResources is non-empty', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      await Session.create(mockBrowser as any);

      expect(mockContext.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    });

    it('should not set up resource blocking when blockResources is empty', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      await Session.create(mockBrowser as any, { blockResources: [] });

      expect(mockContext.route).not.toHaveBeenCalled();
    });

    it('should set profileName if provided', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any, {
        profileName: 'test-profile',
      });

      expect(session.profileName).toBe('test-profile');
    });

    it('should block matching resource types via route handler', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      await Session.create(mockBrowser as any);

      // Get the route handler
      const routeCall = mockContext.route.mock.calls[0];
      const routeHandler = routeCall[1];

      // Test blocking an image
      const mockRoute = {
        request: vi.fn().mockReturnValue({
          resourceType: vi.fn().mockReturnValue('image'),
        }),
        abort: vi.fn().mockResolvedValue(undefined),
        continue: vi.fn().mockResolvedValue(undefined),
      };

      await routeHandler(mockRoute);
      expect(mockRoute.abort).toHaveBeenCalled();
      expect(mockRoute.continue).not.toHaveBeenCalled();
    });

    it('should allow non-blocked resource types via route handler', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      await Session.create(mockBrowser as any);

      const routeHandler = mockContext.route.mock.calls[0][1];

      const mockRoute = {
        request: vi.fn().mockReturnValue({
          resourceType: vi.fn().mockReturnValue('document'),
        }),
        abort: vi.fn().mockResolvedValue(undefined),
        continue: vi.fn().mockResolvedValue(undefined),
      };

      await routeHandler(mockRoute);
      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
    });
  });

  describe('touch', () => {
    it('should update lastActivity', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);
      const before = session.lastActivity;

      // Wait a tiny bit to ensure time passes
      await new Promise((r) => setTimeout(r, 5));
      session.touch();

      expect(session.lastActivity).toBeGreaterThanOrEqual(before);
    });
  });

  describe('isExpired', () => {
    it('should return false when not expired', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      expect(session.isExpired(300000)).toBe(false);
    });

    it('should return true when expired', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      // Manually set lastActivity to the past
      (session as any).lastActivity = Date.now() - 400000;

      expect(session.isExpired(300000)).toBe(true);
    });
  });

  describe('getElementByRef', () => {
    it('should return element by ref', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      const mockElement = { mock: true } as any;
      session.refs.set('r1', mockElement);

      expect(session.getElementByRef('r1')).toBe(mockElement);
    });

    it('should return undefined for unknown ref', async () => {
      const { mockBrowser } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      expect(session.getElementByRef('r99')).toBeUndefined();
    });
  });

  describe('close', () => {
    it('should close the browser context', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      await session.close();
      expect(mockContext.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      const session = await Session.create(mockBrowser as any);

      mockContext.close.mockRejectedValue(new Error('close failed'));
      await session.close(); // Should not throw
    });
  });
});
