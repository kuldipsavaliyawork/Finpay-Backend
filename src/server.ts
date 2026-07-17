import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app';
import { config } from './config/config';
import { logger } from './infrastructure/logger/logger';
import { prisma, disconnectPrisma, pingDatabase } from './infrastructure/prisma';
import { cache } from './infrastructure/cache';
import { queue } from './infrastructure/queue';

/**
 * Boot sequence: connect Prisma, start the HTTP server, install graceful
 * shutdown handlers.
 */
async function bootstrap(): Promise<void> {
  await prisma.$connect();
  const dbUp = await pingDatabase();
  if (!dbUp) {
    logger.warn('Database ping failed at startup — continuing, /health will report db:down');
  }

  const app = createApp();
  const server: Server = app.listen(config.port, () => {
    logger.info(`FinPay API listening on http://localhost:${config.port} (env=${config.env})`);
    logger.info(`API base: /api/${config.apiVersion}  ·  Docs: /api/docs`);
  });

  // Live presence for SessionContext (Topbar online users + session revoke pushes).
  const { attachSessionSockets } = await import('./realtime/sessions.socket');
  attachSessionSockets(server);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => logger.info('HTTP server closed'));
    try {
      await Promise.allSettled([
        disconnectPrisma(),
        cache.close?.(),
        queue.close?.(),
      ]);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
