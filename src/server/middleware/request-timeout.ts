import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

class RequestTimeoutError extends Error {
  readonly statusCode = 504;
  readonly code = 'REQUEST_TIMEOUT';

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

async function requestTimeoutPlugin(fastify: FastifyInstance): Promise<void> {
  const timeoutMs = config.requestTimeoutMs;

  if (timeoutMs <= 0) return; // Disabled

  fastify.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const timer = setTimeout(() => {
      logger.warn({ method: request.method, url: request.url, timeoutMs }, 'Request timed out');
      reply.status(504).send({
        error: {
          code: 'REQUEST_TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms`,
          statusCode: 504,
        },
      });
    }, timeoutMs);

    // Clear timeout when the response finishes
    reply.raw.on('close', () => clearTimeout(timer));
    done();
  });
}

export default fp(requestTimeoutPlugin, {
  name: 'request-timeout',
});

export { RequestTimeoutError };
