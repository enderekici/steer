import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { takeSnapshot, type SnapshotVerbosity } from "../../processing/snapshot.js";

interface SessionParams {
  id: string;
}

interface ObserveQuery {
  scope?: string;
  verbosity?: SnapshotVerbosity;
  maxRefs?: number;
}

export async function observeRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // GET /sessions/:id/observe
  fastify.get<{ Params: SessionParams; Querystring: ObserveQuery }>(
    "/:id/observe",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            scope: { type: "string" },
            verbosity: {
              type: "string",
              enum: ["minimal", "normal", "detailed"],
            },
            maxRefs: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Querystring: ObserveQuery }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);

      const { snapshot, refMap } = await takeSnapshot(session.page, {
        scope: request.query.scope,
        verbosity: request.query.verbosity,
        maxRefs: request.query.maxRefs,
      });

      // Update session refs with the fresh handles
      session.refs.clear();
      for (const [key, handle] of refMap) {
        session.refs.set(key, handle);
      }

      session.touch();

      return snapshot;
    },
  );
}
