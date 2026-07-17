import type { Request } from 'express';
import { PAGINATION } from '../../config/constants';
import type { PageMeta } from '../http/envelope';

export interface Paging {
  page: number;
  pageSize: number;
  /** Prisma skip. */
  skip: number;
  /** Prisma take. */
  take: number;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * Parse `page` and `pageSize` from the request query with sane bounds.
 * page defaults to 1, pageSize to PAGINATION.DEFAULT_PAGE_SIZE, capped at MAX.
 */
export function parsePaging(req: Request): Paging {
  const q = req.query as Record<string, unknown>;
  const page = toPositiveInt(q.page, PAGINATION.DEFAULT_PAGE);
  const rawSize = toPositiveInt(q.pageSize, PAGINATION.DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(rawSize, PAGINATION.MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Build pagination meta for a response given the total row count. */
export function buildMeta(total: number, paging: Pick<Paging, 'page' | 'pageSize'>): PageMeta {
  return {
    page: paging.page,
    pageSize: paging.pageSize,
    total,
    totalPages: paging.pageSize > 0 ? Math.ceil(total / paging.pageSize) : 0,
  };
}
