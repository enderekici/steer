import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface SessionParams {
  id: string;
}

interface ScreenshotQuery {
  fullPage?: boolean;
  quality?: number;
}

export async function screenshotRoutes(fastify: FastifyInstance): Promise<void> {
  const sm = fastify.sessionManager;

  // GET /sessions/:id/screenshot
  fastify.get<{ Params: SessionParams; Querystring: ScreenshotQuery }>(
    "/:id/screenshot",
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
            fullPage: { type: "boolean", default: false },
            quality: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
          additionalProperties: false,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams; Querystring: ScreenshotQuery }>,
      reply: FastifyReply,
    ) => {
      const session = sm.getSession(request.params.id);
      session.touch();

      const fullPage = request.query.fullPage ?? false;
      const quality = request.query.quality ?? 50;

      const buffer = await session.page.screenshot({
        type: "jpeg",
        fullPage,
        quality,
      });

      return reply
        .header("Content-Type", "image/jpeg")
        .header("Content-Length", buffer.length)
        .send(buffer);
    },
  );
}
