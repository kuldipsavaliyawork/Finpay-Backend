import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../../config/config';
import { errorBody } from '../http/envelope';
import { ERROR_CODES } from '../../config/constants';

function handler(_req: Request, res: Response): void {
  res
    .status(429)
    .json(errorBody(ERROR_CODES.RATE_LIMITED, 'Too many requests, please try again later'));
}

/** Global API rate limiter. */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** Stricter limiter for auth-sensitive endpoints (login/refresh/forgot). */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
