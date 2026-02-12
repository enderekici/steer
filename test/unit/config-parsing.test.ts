/**
 * Tests for config env variable parsing (src/config.ts).
 * Uses dynamic import with vi.resetModules() to test env var overrides.
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config env var parsing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('STEER_') && !(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, val] of Object.entries(originalEnv)) {
      if (key.startsWith('STEER_')) {
        process.env[key] = val;
      }
    }
  });

  it('should parse STEER_PORT as integer', async () => {
    process.env.STEER_PORT = '8080';
    const { config } = await import('../../src/config.js');
    expect(config.port).toBe(8080);
  });

  it('should fall back to default for invalid STEER_PORT', async () => {
    process.env.STEER_PORT = 'abc';
    const { config } = await import('../../src/config.js');
    expect(config.port).toBe(3000);
  });

  it('should parse STEER_HEADLESS as boolean true', async () => {
    process.env.STEER_HEADLESS = 'true';
    const { config } = await import('../../src/config.js');
    expect(config.headless).toBe(true);
  });

  it('should parse STEER_HEADLESS "1" as true', async () => {
    process.env.STEER_HEADLESS = '1';
    const { config } = await import('../../src/config.js');
    expect(config.headless).toBe(true);
  });

  it('should parse STEER_HEADLESS "false" as false', async () => {
    process.env.STEER_HEADLESS = 'false';
    const { config } = await import('../../src/config.js');
    expect(config.headless).toBe(false);
  });

  it('should parse STEER_HEADLESS "0" as false', async () => {
    process.env.STEER_HEADLESS = '0';
    const { config } = await import('../../src/config.js');
    expect(config.headless).toBe(false);
  });

  it('should parse STEER_ALLOWED_DOMAINS as comma-separated list', async () => {
    process.env.STEER_ALLOWED_DOMAINS = 'example.com, test.org, api.io';
    const { config } = await import('../../src/config.js');
    expect(config.allowedDomains).toEqual(['example.com', 'test.org', 'api.io']);
  });

  it('should parse empty STEER_ALLOWED_DOMAINS as empty array', async () => {
    process.env.STEER_ALLOWED_DOMAINS = '';
    const { config } = await import('../../src/config.js');
    expect(config.allowedDomains).toEqual([]);
  });

  it('should parse whitespace STEER_ALLOWED_DOMAINS as empty array', async () => {
    process.env.STEER_ALLOWED_DOMAINS = '   ';
    const { config } = await import('../../src/config.js');
    expect(config.allowedDomains).toEqual([]);
  });

  it('should parse STEER_BLOCK_RESOURCES', async () => {
    process.env.STEER_BLOCK_RESOURCES = 'image,font';
    const { config } = await import('../../src/config.js');
    expect(config.blockResources).toEqual(['image', 'font']);
  });

  it('should parse STEER_BROWSER as valid browser type', async () => {
    process.env.STEER_BROWSER = 'chromium';
    const { config } = await import('../../src/config.js');
    expect(config.browser).toBe('chromium');
  });

  it('should parse STEER_BROWSER webkit', async () => {
    process.env.STEER_BROWSER = 'webkit';
    const { config } = await import('../../src/config.js');
    expect(config.browser).toBe('webkit');
  });

  it('should fall back to default for invalid STEER_BROWSER', async () => {
    process.env.STEER_BROWSER = 'lynx';
    const { config } = await import('../../src/config.js');
    expect(config.browser).toBe('firefox');
  });

  it('should parse STEER_HOST', async () => {
    process.env.STEER_HOST = 'localhost';
    const { config } = await import('../../src/config.js');
    expect(config.host).toBe('localhost');
  });

  it('should parse STEER_MAX_SESSIONS', async () => {
    process.env.STEER_MAX_SESSIONS = '5';
    const { config } = await import('../../src/config.js');
    expect(config.maxSessions).toBe(5);
  });

  it('should parse STEER_SESSION_TIMEOUT_MS', async () => {
    process.env.STEER_SESSION_TIMEOUT_MS = '60000';
    const { config } = await import('../../src/config.js');
    expect(config.sessionTimeoutMs).toBe(60000);
  });

  it('should parse STEER_REQUEST_TIMEOUT_MS', async () => {
    process.env.STEER_REQUEST_TIMEOUT_MS = '15000';
    const { config } = await import('../../src/config.js');
    expect(config.requestTimeoutMs).toBe(15000);
  });

  it('should parse STEER_VIEWPORT_WIDTH', async () => {
    process.env.STEER_VIEWPORT_WIDTH = '1920';
    const { config } = await import('../../src/config.js');
    expect(config.viewportWidth).toBe(1920);
  });

  it('should parse STEER_VIEWPORT_HEIGHT', async () => {
    process.env.STEER_VIEWPORT_HEIGHT = '1080';
    const { config } = await import('../../src/config.js');
    expect(config.viewportHeight).toBe(1080);
  });

  it('should filter empty strings from envList', async () => {
    process.env.STEER_BLOCK_RESOURCES = 'image,,font,,';
    const { config } = await import('../../src/config.js');
    expect(config.blockResources).toEqual(['image', 'font']);
  });
});
