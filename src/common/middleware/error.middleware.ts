import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors';
import { errorBody } from '../http/envelope';
import { ERROR_CODES } from '../../config/constants';
import { logger } from '../../infrastructure/logger/logger';

/** Flatten a ZodError into a compact field->messages map. */
function zodDetails(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.') || '_';
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Terminal error handler. MUST be registered last. Maps AppError, ZodError and
 * known Prisma errors to the error envelope; everything else becomes a generic
 * 500 INTERNAL with the real cause logged (never leaked to the client).
 */
export const errorMiddleware: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // next is required for Express to treat this as an error handler.
  _next: NextFunction,
): void => {
  // Known application errors.
  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorBody(err.code, err.message, err.details));
    return;
  }

  // Zod validation errors that reach here without being wrapped.
  if (err instanceof ZodError) {
    res
      .status(422)
      .json(errorBody(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', zodDetails(err)));
    return;
  }

  // Prisma known-request errors.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | string | undefined) ?? undefined;
        res
          .status(409)
          .json(errorBody(ERROR_CODES.CONFLICT, 'A record with these values already exists', { target }));
        return;
      }
      case 'P2025':
        res.status(404).json(errorBody(ERROR_CODES.NOT_FOUND, 'Record not found'));
        return;
      case 'P2003':
        res
          .status(409)
          .json(errorBody(ERROR_CODES.CONFLICT, 'Related record constraint failed'));
        return;
      default:
        logger.error({ err, code: err.code }, 'Unhandled Prisma known error');
        res.status(500).json(errorBody(ERROR_CODES.INTERNAL, 'Internal server error'));
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err }, 'Prisma validation error');
    res.status(400).json(errorBody(ERROR_CODES.BAD_REQUEST, 'Invalid request data'));
    return;
  }

  // Unknown / unexpected: log full detail, return generic message.
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json(errorBody(ERROR_CODES.INTERNAL, 'Internal server error'));
};

/** 404 handler for unmatched routes (registered just before errorMiddleware). */
export function notFoundMiddleware(req: Request, res: Response): void {
  res
    .status(404)
    .json(errorBody(ERROR_CODES.NOT_FOUND, `Route not found: ${req.method} ${req.path}`));
}
