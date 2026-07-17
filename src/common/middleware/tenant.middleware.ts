import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors';

/**
 * requireTenant — ensures req.ctx.tenantId is present (i.e. the access token
 * carried a tenant binding). Mount after requireAuth on tenant-scoped routes.
 * Repositories read the tenantId from req.ctx.tenantId.
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  const ctx = req.ctx;
  if (!ctx || !ctx.tenantId) {
    throw new UnauthorizedError('No tenant context');
  }
  next();
}
