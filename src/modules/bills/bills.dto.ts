import { z } from 'zod';

/**
 * Zod request schemas for the bills module (accounts payable). Controllers
 * read the validated, typed output (see `validate` middleware) — never raw
 * req.body/query/params.
 */

const money = z.coerce.number().min(0);

export const billItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: money,
  taxRateId: z.string().uuid().optional(),
  taxAmount: money.default(0),
  accountId: z.string().uuid().optional(), // expense account for this line
});
export type BillItemInput = z.infer<typeof billItemSchema>;

export const createBillSchema = z.object({
  vendorId: z.string().uuid(),
  issueDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(billItemSchema).min(1),
});
export type CreateBillInput = z.infer<typeof createBillSchema>;

export const updateBillSchema = z.object({
  issueDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(billItemSchema).min(1).optional(),
});
export type UpdateBillInput = z.infer<typeof updateBillSchema>;

export const BILL_STATUSES = [
  'draft',
  'pending',
  'approved',
  'partial',
  'paid',
  'overdue',
  'cancelled',
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const listBillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  status: z.enum(BILL_STATUSES).optional(),
  vendorId: z.string().uuid().optional(),
  sortBy: z.enum(['number', 'issueDate', 'dueDate', 'total', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListBillQuery = z.infer<typeof listBillQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const cancelBillSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelBillInput = z.infer<typeof cancelBillSchema>;
