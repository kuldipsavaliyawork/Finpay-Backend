import { z } from 'zod';

/**
 * Zod request schemas for the approvals module (ApprovalRequest + ApprovalStep).
 * Controllers read the validated, typed output (see `validate` middleware) —
 * never raw req.body/query/params.
 */

export const APPROVAL_ENTITY_TYPES = ['invoice', 'bill', 'expense', 'journal'] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const APPROVAL_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export const APPROVAL_STEP_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

/** Create an approval request for an entity, with an ordered list of approver steps. */
export const createApprovalRequestSchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().uuid(),
  /** Ordered approver ids — level 1..N. At least one level is required. */
  approverIds: z.array(z.string().uuid()).min(1).max(20),
});
export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;

export const listApprovalRequestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(APPROVAL_REQUEST_STATUSES).optional(),
  entityType: z.enum(APPROVAL_ENTITY_TYPES).optional(),
  requestedBy: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'currentLevel']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListApprovalRequestQuery = z.infer<typeof listApprovalRequestQuerySchema>;

/** Pending-for-me listing: approval requests whose current-level step is assigned to the caller. */
export const listPendingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  entityType: z.enum(APPROVAL_ENTITY_TYPES).optional(),
});
export type ListPendingQuery = z.infer<typeof listPendingQuerySchema>;

export const actOnStepSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});
export type ActOnStepInput = z.infer<typeof actOnStepSchema>;

export const rejectStepSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});
export type RejectStepInput = z.infer<typeof rejectStepSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
