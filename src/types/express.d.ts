import 'express';

/**
 * Per-request authenticated context, populated by the auth + tenant middleware
 * from the verified access-token claims. Repositories read tenantId from here.
 */
export interface RequestContext {
  userId: string;
  tenantId: string;
  roles: string[];
  perms: string[];
}

declare global {
  namespace Express {
    interface Request {
      /** Present after requireAuth; guaranteed present after tenant middleware. */
      ctx?: RequestContext;
      /** Idempotency key echoed by the idempotency middleware, when present. */
      idempotencyKey?: string;
    }
  }
}

export {};
