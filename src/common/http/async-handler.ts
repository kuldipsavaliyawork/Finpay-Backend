import type { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * Wrap an async route/controller handler so any rejected promise is forwarded
 * to Express's error pipeline (and thus our error middleware) instead of
 * producing an unhandled rejection.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
