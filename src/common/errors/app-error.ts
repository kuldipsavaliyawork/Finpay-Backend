import { ERROR_CODES, type ErrorCode } from '../../config/constants';

/**
 * Base application error. Carries an HTTP statusCode, a stable machine-readable
 * error code, and optional structured details. Thrown anywhere in a request and
 * translated to the error envelope by the error middleware.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  /** true for expected/handled errors we can safely surface to the client. */
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, ERROR_CODES.BAD_REQUEST, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, ERROR_CODES.UNAUTHORIZED, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, ERROR_CODES.FORBIDDEN, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super(404, ERROR_CODES.NOT_FOUND, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, ERROR_CODES.CONFLICT, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(422, ERROR_CODES.VALIDATION_ERROR, message, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(422, ERROR_CODES.UNPROCESSABLE, message, details);
  }
}
