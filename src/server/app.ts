import Fastify, { type FastifyInstance } from "fastify";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import type { SessionManager } from "../browser/session-manager.js";
import errorHandler from "./middleware/error-handler.js";
import security from "./middleware/security.js";
import requestTimeout from "./middleware/request-timeout.js";
import { sessionRoutes } from "./routes/sessions.js";
import { navigateRoutes } from "./routes/navigate.js";
import { actRoutes } from "./routes/act.js";
import { extractRoutes } from "./routes/extract.js";
import { observeRoutes } from "./routes/observe.js";
import { screenshotRoutes } from "./routes/screenshot.js";

// Extend FastifyInstance to include the sessionManager decoration
declare module "fastify" {
  interface FastifyInstance {
    sessionManager: SessionManager;
  }
}

export function buildApp(sessionManager: SessionManager): FastifyInstance {
  const app = Fastify({
    logger: false, // We use our own pino logger
    disableRequestLogging: true,
  });

  // Decorate so routes can access the session manager
  app.decorate("sessionManager", sessionManager);

  // Register middleware
  app.register(errorHandler);
  app.register(security);
  app.register(requestTimeout);

  // Health check
  app.get("/health", async () => {
    const sessionList = sessionManager.listSessions();
    return {
      status: "ok",
      sessions: sessionList.length,
      config: {
        maxSessions: config.maxSessions,
        sessionTimeoutMs: config.sessionTimeoutMs,
        requestTimeoutMs: config.requestTimeoutMs,
      },
    };
  });

  // Register all route groups under /sessions prefix
  app.register(sessionRoutes, { prefix: "/sessions" });
  app.register(navigateRoutes, { prefix: "/sessions" });
  app.register(actRoutes, { prefix: "/sessions" });
  app.register(extractRoutes, { prefix: "/sessions" });
  app.register(observeRoutes, { prefix: "/sessions" });
  app.register(screenshotRoutes, { prefix: "/sessions" });

  // Request logging hook
  app.addHook("onResponse", (request, reply, done) => {
    logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
    done();
  });

  return app;
}
