import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config/config';
import { logger } from './logger/logger';

/**
 * PrismaClient singleton. In development we keep a single instance across
 * hot-reloads via globalThis to avoid exhausting the connection pool, and we
 * wire query/error logging to pino.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const logLevels: Prisma.LogLevel[] = config.isDev
  ? ['error', 'warn']
  : ['error'];

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevels.map((level) => ({ emit: 'event', level })),
    datasources: { db: { url: config.databaseUrl } },
  });

// Bridge Prisma's event emitter into pino. Casts are required because the
// event payload type depends on the generic log config.
type ErrorEvent = { message: string; target: string };
type WarnEvent = { message: string };

(prisma as unknown as {
  $on(event: 'error', cb: (e: ErrorEvent) => void): void;
  $on(event: 'warn', cb: (e: WarnEvent) => void): void;
}).$on('error', (e) => logger.error({ target: e.target }, e.message));

if (config.isDev) {
  (prisma as unknown as { $on(event: 'warn', cb: (e: WarnEvent) => void): void }).$on(
    'warn',
    (e) => logger.warn(e.message),
  );
  globalForPrisma.prisma = prisma;
}

/** Verify DB connectivity; used by /health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, 'Database ping failed');
    return false;
  }
}

/** Gracefully disconnect (called on shutdown). */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export { Prisma };
