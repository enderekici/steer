import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { takeSnapshot } from "../../processing/snapshot.js";

interface SessionParams {
  id: string;
}

export async function observeRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // GET /sessions/:id/observe
  fastify.get<{ Params: SessionParams }>(
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
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);

      const { snapshot, refMap } = await takeSnapshot(session.page);

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
