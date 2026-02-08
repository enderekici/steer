import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { executeAction } from '../../actions/index.js';

interface ActBody {
  action:
    | 'click'
    | 'type'
    | 'select'
    | 'scroll'
    | 'wait'
    | 'keyboard'
    | 'hover'
    | 'upload'
    | 'dialog';
  ref?: string;
  selector?: string;
  value?: string;
  direction?: string;
  state?: string;
  timeout?: number;
  key?: string;
  filePaths?: string[];
  dialogAction?: string;
  promptText?: string;
}

interface SessionParams {
  id: string;
}

export async function actRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // POST /sessions/:id/act
  fastify.post<{ Params: SessionParams; Body: ActBody }>(
    '/:id/act',
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
            action: {
              type: 'string',
              enum: [
                'click',
                'type',
                'select',
                'scroll',
                'wait',
                'keyboard',
                'hover',
                'upload',
                'dialog',
              ],
            },
            ref: { type: 'string' },
            selector: { type: 'string' },
            value: { type: 'string' },
            direction: {
              type: 'string',
              enum: ['up', 'down', 'left', 'right'],
            },
            state: {
              type: 'string',
              enum: ['visible', 'hidden', 'attached', 'detached'],
            },
            timeout: { type: 'number' },
            key: { type: 'string' },
            filePaths: {
              type: 'array',
              items: { type: 'string' },
            },
            dialogAction: {
              type: 'string',
              enum: ['accept', 'dismiss'],
            },
            promptText: { type: 'string' },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: ActBody }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);
      const {
        action,
        ref,
        selector,
        value,
        direction,
        state,
        timeout,
        key,
        filePaths,
        dialogAction,
        promptText,
      } = request.body;

      const target = ref || selector ? { ref, selector } : undefined;

      const result = await executeAction(session, action, {
        target,
        value,
        direction: direction as 'up' | 'down' | 'left' | 'right' | undefined,
        selector,
        state: state as 'visible' | 'hidden' | 'attached' | 'detached' | undefined,
        timeout,
        key,
        filePaths,
        dialogAction: dialogAction as 'accept' | 'dismiss' | undefined,
        promptText,
      });

      return result;
    },
  );
}
