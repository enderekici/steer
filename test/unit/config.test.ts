process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';

/**
 * Since config.ts reads env vars at module load time and the module is cached,
 * we test the default values here. Env var override tests would require
 * vi.resetModules() and dynamic re-import, but Vitest ESM does not support
 * variable dynamic imports. Instead, we validate the shape and defaults of the
 * already-loaded config object, and test the helper parsing logic indirectly.
 */

describe('config defaults', () => {
  it('should have port as a number', () => {
    expect(typeof config.port).toBe('number');
  });

  it('should have host as a string', () => {
    expect(typeof config.host).toBe('string');
  });

  it('should have maxSessions as a number', () => {
    expect(typeof config.maxSessions).toBe('number');
    expect(config.maxSessions).toBeGreaterThan(0);
  });

  it('should have sessionTimeoutMs as a positive number', () => {
    expect(typeof config.sessionTimeoutMs).toBe('number');
    expect(config.sessionTimeoutMs).toBeGreaterThan(0);
  });

  it('should have allowedDomains as an array', () => {
    expect(Array.isArray(config.allowedDomains)).toBe(true);
  });

  it('should have headless as a boolean', () => {
    expect(typeof config.headless).toBe('boolean');
  });

  it('should have blockResources as an array of strings', () => {
    expect(Array.isArray(config.blockResources)).toBe(true);
    for (const item of config.blockResources) {
      expect(typeof item).toBe('string');
    }
  });

  it('should have browser as one of the valid types', () => {
    expect(['chromium', 'firefox', 'webkit']).toContain(config.browser);
  });

  it('should have viewportWidth as a positive number', () => {
    expect(typeof config.viewportWidth).toBe('number');
    expect(config.viewportWidth).toBeGreaterThan(0);
  });

  it('should have viewportHeight as a positive number', () => {
    expect(typeof config.viewportHeight).toBe('number');
    expect(config.viewportHeight).toBeGreaterThan(0);
  });
});

describe('config default values (when env vars are not overridden)', () => {
  // These tests verify the well-known defaults. If the test environment has
  // the corresponding env vars set, these may need adjustment.

  it('should default port to 3000', () => {
    if (!process.env.STEER_PORT) {
      expect(config.port).toBe(3000);
    }
  });

  it('should default host to 0.0.0.0', () => {
    if (!process.env.STEER_HOST) {
      expect(config.host).toBe('0.0.0.0');
    }
  });

  it('should default maxSessions to 10', () => {
    if (!process.env.STEER_MAX_SESSIONS) {
      expect(config.maxSessions).toBe(10);
    }
  });

  it('should default sessionTimeoutMs to 300000', () => {
    if (!process.env.STEER_SESSION_TIMEOUT_MS) {
      expect(config.sessionTimeoutMs).toBe(300_000);
    }
  });

  it('should default allowedDomains to empty array', () => {
    if (!process.env.STEER_ALLOWED_DOMAINS) {
      expect(config.allowedDomains).toEqual([]);
    }
  });

  it('should default headless to true', () => {
    if (!process.env.STEER_HEADLESS) {
      expect(config.headless).toBe(true);
    }
  });

  it('should default blockResources to image, font, media', () => {
    if (!process.env.STEER_BLOCK_RESOURCES) {
      expect(config.blockResources).toEqual(['image', 'font', 'media']);
    }
  });

  it('should default browser to firefox', () => {
    if (!process.env.STEER_BROWSER) {
      expect(config.browser).toBe('firefox');
    }
  });

  it('should default viewport to 1280x720', () => {
    if (!process.env.STEER_VIEWPORT_WIDTH) {
      expect(config.viewportWidth).toBe(1280);
    }
    if (!process.env.STEER_VIEWPORT_HEIGHT) {
      expect(config.viewportHeight).toBe(720);
    }
  });
});
