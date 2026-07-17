import { Prisma, type PrismaClient, type AuditLog } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';
import { parseOptionalDate } from '../../common/http';
import type { AuditFilters } from './audit.dto';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListAuditArgs extends AuditFilters {
  skip: number;
  take: number;
  sortDir?: 'asc' | 'desc';
}

/**
 * Audit logs are tenant-scoped like every other table, but `tenantId` on
 * AuditLog is nullable (system-level events — e.g. failed login before a
 * tenant is resolved — may have no tenant). Reads for this module ALWAYS
 * scope to the caller's tenantId; nullable rows from other tenants/system
 * events are never exposed here.
 */
function auditWhere(tenantId: string, f: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (f.module) where.module = f.module;
  if (f.action) where.action = f.action;
  if (f.entityType) where.entityType = f.entityType;
  if (f.entityId) where.entityId = f.entityId;
  if (f.userId) where.userId = f.userId;

  const from = parseOptionalDate(f.from);
  const to = parseOptionalDate(f.to);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  if (f.q) {
    where.OR = [
      { action: { contains: f.q, mode: 'insensitive' } },
      { module: { contains: f.q, mode: 'insensitive' } },
      { entityType: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export const auditRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<AuditLog | null> {
    return db.auditLog.findFirst({ where: { id, tenantId } });
  },

  list(tenantId: string, a: ListAuditArgs, db: Db = prisma): Promise<AuditLog[]> {
    const where = auditWhere(tenantId, a);
    return db.auditLog.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { createdAt: a.sortDir ?? 'desc' },
    });
  },

  count(tenantId: string, f: AuditFilters, db: Db = prisma): Promise<number> {
    return db.auditLog.count({ where: auditWhere(tenantId, f) });
  },

  /** Used by CSV export — same filters, capped take, no pagination meta needed. */
  listForExport(
    tenantId: string,
    f: AuditFilters,
    limit: number,
    db: Db = prisma,
  ): Promise<AuditLog[]> {
    const where = auditWhere(tenantId, f);
    return db.auditLog.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  },
};
