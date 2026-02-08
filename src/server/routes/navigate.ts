import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { executeNavigate } from '../../actions/index.js';

interface NavigateBody {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

interface SessionParams {
  id: string;
}

export async function navigateRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // POST /sessions/:id/navigate
  fastify.post<{ Params: SessionParams; Body: NavigateBody }>(
    '/:id/navigate',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            waitUntil: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: NavigateBody }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);
      const { url, waitUntil } = request.body;

      const result = await executeNavigate(session, url, waitUntil);

      return {
        url: result.url,
        title: result.snapshot.title,
        snapshot: result.snapshot,
      };
    },
  );
}
