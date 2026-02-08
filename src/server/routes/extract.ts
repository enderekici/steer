import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type ExtractOptions, extractContent } from '../../processing/content.js';

interface SessionParams {
  id: string;
}

export async function extractRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // POST /sessions/:id/extract
  fastify.post<{ Params: SessionParams; Body: ExtractOptions }>(
    '/:id/extract',
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
            mode: {
              type: 'string',
              enum: ['text', 'markdown', 'structured'],
            },
            selector: { type: 'string' },
            schema: { type: 'object' },
            maxLength: { type: 'integer', minimum: 1 },
          },
          required: ['mode'],
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: ExtractOptions }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);
      session.touch();

      const result = await extractContent(session.page, request.body);

      return result;
    },
  );
}
