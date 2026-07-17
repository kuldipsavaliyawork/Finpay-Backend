import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';
import { IDEMPOTENCY_HEADER } from '../../config/constants';
import { ConflictError, UnauthorizedError } from '../errors';
import { logger } from '../../infrastructure/logger/logger';

/** Hours an idempotency record is retained before it can be reused. */
const IDEMPOTENCY_TTL_HOURS = 24;

function hashRequest(req: Request): string {
  const payload = JSON.stringify({ method: req.method, path: req.path, body: req.body ?? null });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * idempotency — dedupe mutating requests keyed by the `Idempotency-Key` header,
 * scoped to the tenant. Behavior:
 *  - No header → passes through (unless `required` is set).
 *  - First time → inserts a locked row, then lets the handler run. A response
 *    hook persists the final status + body so a retry can replay it.
 *  - Replay of a completed key with the same request hash → returns the stored
 *    response verbatim.
 *  - Same key, different request body → 409 CONFLICT (key reuse mismatch).
 *  - Key still locked (in-flight) → 409 CONFLICT.
 *
 * Requires req.ctx.tenantId — mount after requireAuth + requireTenant.
 */
export function idempotency(options: { required?: boolean } = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.get(IDEMPOTENCY_HEADER);
    if (!key) {
      if (options.required) {
        next(new ConflictError(`Missing ${IDEMPOTENCY_HEADER} header`));
        return;
      }
      next();
      return;
    }

    const ctx = req.ctx;
    if (!ctx?.tenantId) {
      next(new UnauthorizedError('No tenant context for idempotency'));
      return;
    }

    const tenantId = ctx.tenantId;
    const requestHash = hashRequest(req);
    req.idempotencyKey = key;

    try {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          next(new ConflictError('Idempotency-Key reused with a different request'));
          return;
        }
        if (existing.completedAt && existing.statusCode) {
          // Replay the stored response.
          res.status(existing.statusCode);
          res.setHeader('Idempotent-Replay', 'true');
          res.json(existing.responseBody ?? null);
          return;
        }
        // Locked but not completed → still processing.
        next(new ConflictError('A request with this Idempotency-Key is already in progress'));
        return;
      }

      // Reserve the key. Unique constraint guards against a concurrent racer.
      await prisma.idempotencyKey.create({
        data: {
          tenantId,
          key,
          method: req.method,
          path: req.path,
          requestHash,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        next(new ConflictError('A request with this Idempotency-Key is already in progress'));
        return;
      }
      next(err);
      return;
    }

    // Hook the JSON serializer to persist the final response once the handler
    // produces it. We capture status + body and upsert the completion.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const statusCode = res.statusCode;
      // Only persist successful (2xx) completions; failures can be retried.
      if (statusCode >= 200 && statusCode < 300) {
        void prisma.idempotencyKey
          .update({
            where: { tenantId_key: { tenantId, key } },
            data: {
              statusCode,
              responseBody: body as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          })
          .catch((err: unknown) =>
            logger.error({ err, key }, 'Failed to persist idempotency completion'),
          );
      } else {
        // Release the lock so the client can retry a failed operation.
        void prisma.idempotencyKey
          .delete({ where: { tenantId_key: { tenantId, key } } })
          .catch(() => undefined);
      }
      return originalJson(body);
    };

    next();
  };
}
