import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }

    // Fastify validation errors (from schema validation)
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          statusCode: 400,
        },
      });
    }

    // Unknown / unexpected errors
    logger.error({ err: error }, 'Unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        statusCode: 500,
      },
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
