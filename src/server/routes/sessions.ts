import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface CreateSessionBody {
  profile?: string;
  viewport?: { width: number; height: number };
  blockResources?: string[];
}

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // POST /sessions - create a new browser session
  fastify.post<{ Body: CreateSessionBody }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            profile: { type: "string" },
            viewport: {
              type: "object",
              properties: {
                width: { type: "integer", minimum: 320, maximum: 3840 },
                height: { type: "integer", minimum: 240, maximum: 2160 },
              },
              required: ["width", "height"],
            },
            blockResources: {
              type: "array",
              items: { type: "string" },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
      const { profile, viewport, blockResources } = request.body ?? {};

      const session = await sm.createSession({
        profileName: profile,
        viewport,
        blockResources,
      });

      return reply.status(201).send({
        id: session.id,
        url: session.page.url(),
        createdAt: session.createdAt,
      });
    },
  );

  // GET /sessions - list active sessions
  fastify.get("/", async (_request: FastifyRequest, _reply: FastifyReply) => {
    const sessions = sm.listSessions();
    return { sessions };
  });

  // DELETE /sessions/:id - destroy a session
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
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
    async (request: FastifyRequest<{ Params: { id: string } }>, _reply: FastifyReply) => {
      await sm.destroySession(request.params.id);
      return { success: true };
    },
  );
}
