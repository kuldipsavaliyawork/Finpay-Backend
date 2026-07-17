import { z } from 'zod';

/**
 * Zod request schemas for the audit module. Read-only: audit log rows are
 * written exclusively via AuditService.record(...) from other modules'
 * services. This module only exposes list/get/export over existing rows.
 */

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

/** Shared filter fields for both the paginated list and the CSV export. */
const auditFilterFields = {
  module: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().trim().optional(), // ISO date/datetime, inclusive lower bound on createdAt
  to: z.string().trim().optional(), // ISO date/datetime, inclusive upper bound on createdAt
  q: z.string().trim().optional(), // free-text match against action/module/entityType
};

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ...auditFilterFields,
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const exportAuditQuerySchema = z.object({
  ...auditFilterFields,
  // Export is unbounded by pagination but capped server-side to avoid runaway queries.
  limit: z.coerce.number().int().min(1).max(50_000).optional(),
});
export type ExportAuditQuery = z.infer<typeof exportAuditQuerySchema>;

export interface AuditFilters {
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: string;
  to?: string;
  q?: string;
}
