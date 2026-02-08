import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export interface SecurityOptions {
  corsOrigin?: boolean | string | string[];
  rateLimitMax?: number;
  rateLimitWindow?: string;
}

async function securityPlugin(
  fastify: FastifyInstance,
  options: SecurityOptions = {},
): Promise<void> {
  await fastify.register(cors, {
    origin: options.corsOrigin ?? true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await fastify.register(rateLimit, {
    max: options.rateLimitMax ?? 100,
    timeWindow: options.rateLimitWindow ?? '1 minute',
  });
}

export default fp(securityPlugin, {
  name: 'security',
});
