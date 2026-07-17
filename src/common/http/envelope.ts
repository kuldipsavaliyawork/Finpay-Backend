import type { Response } from 'express';
import type { ErrorCode } from '../../config/constants';

/** Pagination metadata attached to list responses. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

/** 200 OK with a data payload and optional meta. */
export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  const body: SuccessEnvelope<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(200).json(body);
}

/** 201 Created with a data payload. */
export function created<T>(res: Response, data: T): Response {
  const body: SuccessEnvelope<T> = { success: true, data };
  return res.status(201).json(body);
}

/** 204 No Content. */
export function noContent(res: Response): Response {
  return res.status(204).send();
}

/** 200 OK for a paginated list. `meta` carries page/pageSize/total/totalPages. */
export function paginated<T>(res: Response, data: T[], meta: PageMeta): Response {
  const body: SuccessEnvelope<T[]> = {
    success: true,
    data,
    meta: { ...meta },
  };
  return res.status(200).json(body);
}

/** Build (but do not send) an error envelope. Used by the error middleware. */
export function errorBody(
  code: ErrorCode | string,
  message: string,
  details?: unknown,
): ErrorEnvelope {
  const error: ErrorEnvelope['error'] =
    details === undefined ? { code, message } : { code, message, details };
  return { success: false, error };
}
