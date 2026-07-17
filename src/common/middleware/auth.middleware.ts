import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../security/tokens';
import { UnauthorizedError } from '../errors';

/** Extract a Bearer token from the Authorization header, if present. */
function extractBearer(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * requireAuth — verify the access token and attach req.ctx. Rejects with 401
 * if the token is missing, malformed, expired, or invalid.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const claims = verifyAccess(token);
  req.ctx = {
    userId: claims.sub,
    tenantId: claims.tid,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    perms: Array.isArray(claims.perms) ? claims.perms : [],
  };
  next();
}

/**
 * optionalAuth — attach req.ctx when a valid token is present, but do not
 * reject anonymous requests. Useful for endpoints with mixed access.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    next();
    return;
  }
  try {
    const claims = verifyAccess(token);
    req.ctx = {
      userId: claims.sub,
      tenantId: claims.tid,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      perms: Array.isArray(claims.perms) ? claims.perms : [],
    };
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}
