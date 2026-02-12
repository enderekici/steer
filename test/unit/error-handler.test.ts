/**
 * Tests for error handler middleware (src/server/middleware/error-handler.ts).
 */

process.env.PLAYWRIGHT_BROWSERS_PATH = `${process.env.HOME}/.cache/ms-playwright`;
process.env.STEER_LOG_LEVEL = 'silent';

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import errorHandler from '../../src/server/middleware/error-handler.js';
import { AppError, ValidationError } from '../../src/utils/errors.js';

describe('errorHandler', () => {
  it('should handle AppError with correct statusCode and code', async () => {
    const app = Fastify({ logger: false });
    app.register(errorHandler);

    app.get('/test', () => {
      throw new ValidationError('test validation error');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('test validation error');
    expect(body.error.statusCode).toBe(400);
  });

  it('should handle Fastify validation errors', async () => {
    const app = Fastify({ logger: false });
    app.register(errorHandler);

    app.post(
      '/test',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
      async () => {
        return { ok: true };
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.statusCode).toBe(400);
  });

  it('should handle unexpected errors with 500', async () => {
    const app = Fastify({ logger: false });
    app.register(errorHandler);

    app.get('/test', () => {
      throw new Error('unexpected error');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.statusCode).toBe(500);
  });

  it('should handle AppError subtypes with their statusCodes', async () => {
    const app = Fastify({ logger: false });
    app.register(errorHandler);

    app.get('/test', () => {
      throw new AppError('custom error', 403, 'FORBIDDEN');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.statusCode).toBe(403);
  });
});
