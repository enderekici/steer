#!/usr/bin/env node

import { browserEngine } from './browser/engine.js';
import { SessionManager } from './browser/session-manager.js';
import { config } from './config.js';
import { buildApp } from './server/app.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  // 1. Launch the browser engine
  await browserEngine.launch({
    browser: config.browser,
    headless: config.headless,
  });

  // 2. Create the session manager
  const sessionManager = new SessionManager(browserEngine);

  // 3. Build and start the Fastify server
  const app = buildApp(sessionManager);

  await app.listen({ port: config.port, host: config.host });

  logger.info({ url: `http://${config.host}:${config.port}` }, 'steer server started');

  // 4. Graceful shutdown handler
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutting down gracefully...');

    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'Error closing Fastify server');
    }

    try {
      sessionManager.stopCleanup();
      await sessionManager.destroyAll();
    } catch (err) {
      logger.error({ err }, 'Error destroying sessions');
    }

    try {
      await browserEngine.close();
    } catch (err) {
      logger.error({ err }, 'Error closing browser engine');
    }

    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start steer server');
  process.exit(1);
});
