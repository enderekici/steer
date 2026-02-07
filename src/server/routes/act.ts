import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { executeAction } from "../../actions/index.js";

interface ActBody {
  action: "click" | "type" | "select" | "scroll";
  ref?: string;
  selector?: string;
  value?: string;
  direction?: string;
}

interface SessionParams {
  id: string;
}

export async function actRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // POST /sessions/:id/act
  fastify.post<{ Params: SessionParams; Body: ActBody }>(
    "/:id/act",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["click", "type", "select", "scroll"],
            },
            ref: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
            direction: {
              type: "string",
              enum: ["up", "down", "left", "right"],
            },
          },
          required: ["action"],
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: ActBody }>,
      _reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);
      const { action, ref, selector, value, direction } = request.body;

      const target = ref || selector ? { ref, selector } : undefined;

      const result = await executeAction(session, action, {
        target,
        value,
        direction: direction as "up" | "down" | "left" | "right" | undefined,
      });

      return result;
    },
  );
}
