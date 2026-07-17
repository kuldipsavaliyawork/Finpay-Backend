import type { Request } from 'express';

/** Tenant-scoped actor context for audited mutations. */
export interface Ctx {
  tenantId: string;
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Build Ctx from an authenticated request (`requireAuth` + `requireTenant`). */
export function ctxOf(req: Request): Ctx {
  const { tenantId, userId } = req.ctx!;
  return {
    tenantId,
    userId,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}
