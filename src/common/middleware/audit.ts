import type { Request } from 'express';
import { prisma } from '../../infrastructure/prisma';
import { logger } from '../../infrastructure/logger/logger';
import type { Prisma } from '@prisma/client';

/**
 * Input for an audit-log entry. Every mutating service calls
 * AuditService.record(...) inside (or right after) its transaction.
 */
export interface AuditRecordInput {
  tenantId?: string | null;
  userId?: string | null;
  /** create | update | delete | post | approve | login | ... */
  action: string;
  /** invoice | ledger | auth | ... */
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Round-trip through JSON to strip Decimals/Dates into serializable form.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * AuditService — writes append-only audit_logs rows. Never throws into the
 * caller: an audit failure must not roll back business operations, so errors
 * are logged and swallowed. Pass a transaction client via `tx` to make the
 * audit row part of the same transaction when atomicity is desired.
 */
export const AuditService = {
  async record(
    input: AuditRecordInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? prisma;
    try {
      await client.auditLog.create({
        data: {
          tenantId: input.tenantId ?? null,
          userId: input.userId ?? null,
          action: input.action,
          module: input.module,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          before: toJson(input.before),
          after: toJson(input.after),
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      logger.error({ err, action: input.action, module: input.module }, 'AuditService.record failed');
      if (tx) throw err; // inside a transaction the caller decides; surface it.
    }
  },

  /** Convenience: derive ip + userAgent from an Express request. */
  fromRequest(
    req: Request,
    input: Omit<AuditRecordInput, 'ip' | 'userAgent' | 'tenantId' | 'userId'> &
      Partial<Pick<AuditRecordInput, 'tenantId' | 'userId'>>,
  ): AuditRecordInput {
    return {
      ...input,
      tenantId: input.tenantId ?? req.ctx?.tenantId ?? null,
      userId: input.userId ?? req.ctx?.userId ?? null,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    };
  },
};
