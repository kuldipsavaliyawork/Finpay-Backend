import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors';

/**
 * requirePermission — allow the request only if req.ctx.perms contains at least
 * one of the given permission keys. Owners/admins receive '*' in their perms
 * (expanded at login) which satisfies any check.
 */
export function requirePermission(...keys: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    if (ctx.perms.includes('*')) return next();
    const allowed = keys.some((k) => ctx.perms.includes(k));
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions', { required: keys });
    }
    next();
  };
}

/**
 * requireAllPermissions — allow only if req.ctx.perms contains ALL given keys.
 */
export function requireAllPermissions(...keys: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    if (ctx.perms.includes('*')) return next();
    const ok = keys.every((k) => ctx.perms.includes(k));
    if (!ok) throw new ForbiddenError('Insufficient permissions', { required: keys });
    next();
  };
}

/**
 * requireRole — coarse-grained check against req.ctx.roles (role keys).
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const allowed = roles.some((r) => ctx.roles.includes(r));
    if (!allowed) throw new ForbiddenError('Insufficient role', { required: roles });
    next();
  };
}
