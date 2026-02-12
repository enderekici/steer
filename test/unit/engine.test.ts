/**
 * Tests for BrowserEngine (src/browser/engine.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock playwright
vi.mock('playwright', () => {
  const createMockBrowser = () => ({
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  });

  const createBrowserType = () => ({
    launch: vi.fn().mockImplementation(async () => createMockBrowser()),
  });

  return {
    chromium: createBrowserType(),
    firefox: createBrowserType(),
    webkit: createBrowserType(),
  };
});

vi.mock('../../src/config.js', () => ({
  config: {
    browser: 'firefox',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
  },
}));

import { chromium, firefox } from 'playwright';
import { BrowserEngine } from '../../src/browser/engine.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BrowserEngine', () => {
  describe('launch', () => {
    it('should launch with default config', async () => {
      const engine = new BrowserEngine();
      await engine.launch();

      expect(firefox.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
        }),
      );
    });

    it('should launch with custom browser type', async () => {
      const engine = new BrowserEngine();
      await engine.launch({ browser: 'chromium' });

      expect(chromium.launch).toHaveBeenCalled();
    });

    it('should launch with custom headless setting', async () => {
      const engine = new BrowserEngine();
      await engine.launch({ headless: false });

      expect(firefox.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
        }),
      );
    });

    it('should throw for unsupported browser type', async () => {
      const engine = new BrowserEngine();
      await expect(engine.launch({ browser: 'lynx' })).rejects.toThrow(
        'Unsupported browser type: lynx',
      );
    });

    it('should close existing browser before re-launching', async () => {
      const engine = new BrowserEngine();
      await engine.launch();
      const firstBrowser = engine.getBrowser();
      await engine.launch();

      expect(firstBrowser.close).toHaveBeenCalled();
    });
  });

  describe('getBrowser', () => {
    it('should return the browser when launched', async () => {
      const engine = new BrowserEngine();
      await engine.launch();

      const browser = engine.getBrowser();
      expect(browser).toBeDefined();
    });

    it('should throw when browser is not launched', () => {
      const engine = new BrowserEngine();
      expect(() => engine.getBrowser()).toThrow('Browser not launched');
    });
  });

  describe('isRunning', () => {
    it('should return true when browser is connected', async () => {
      const engine = new BrowserEngine();
      await engine.launch();

      expect(engine.isRunning()).toBe(true);
    });

    it('should return false when browser is not launched', () => {
      const engine = new BrowserEngine();
      expect(engine.isRunning()).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the browser', async () => {
      const engine = new BrowserEngine();
      await engine.launch();
      const browser = engine.getBrowser();

      await engine.close();
      expect(browser.close).toHaveBeenCalled();
    });

    it('should handle close when browser is null', async () => {
      const engine = new BrowserEngine();
      await engine.close(); // Should not throw
    });

    it('should handle close error gracefully', async () => {
      const engine = new BrowserEngine();
      await engine.launch();
      const browser = engine.getBrowser();
      browser.close.mockRejectedValue(new Error('close failed'));

      await engine.close(); // Should not throw
    });

    it('should set browser to null after close', async () => {
      const engine = new BrowserEngine();
      await engine.launch();
      await engine.close();

      expect(engine.isRunning()).toBe(false);
    });
  });

  describe('disconnected event', () => {
    it('should set browser to null on disconnect', async () => {
      const engine = new BrowserEngine();
      await engine.launch();
      const browser = engine.getBrowser();

      // Get the 'disconnected' callback and call it
      const onCall = browser.on.mock.calls.find((c: any[]) => c[0] === 'disconnected');
      expect(onCall).toBeDefined();

      // Simulate disconnect
      onCall[1]();

      expect(engine.isRunning()).toBe(false);
    });
  });
});
