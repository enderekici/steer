/**
 * Tests for request timeout middleware (src/server/middleware/request-timeout.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

// We need to control config.requestTimeoutMs
vi.mock('../../src/config.js', () => ({
  config: {
    requestTimeoutMs: 100, // 100ms for fast tests
  },
}));

import requestTimeout from '../../src/server/middleware/request-timeout.js';

describe('requestTimeout plugin', () => {
  it('should timeout slow requests', async () => {
    const app = Fastify({ logger: false });
    app.register(requestTimeout);

    app.get('/slow', async () => {
      // Wait longer than the timeout
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/slow',
    });

    expect(response.statusCode).toBe(504);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('REQUEST_TIMEOUT');
  });

  it('should not timeout fast requests', async () => {
    const app = Fastify({ logger: false });
    app.register(requestTimeout);

    app.get('/fast', async () => {
      return { ok: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/fast',
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('requestTimeout disabled', () => {
  it('should not timeout when requestTimeoutMs is 0', async () => {
    // Override config for this test
    const { config } = await import('../../src/config.js');
    const original = config.requestTimeoutMs;
    (config as any).requestTimeoutMs = 0;

    const app = Fastify({ logger: false });
    app.register(requestTimeout);

    app.get('/test', async () => {
      return { ok: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);

    // Restore
    (config as any).requestTimeoutMs = original;
  });
});
