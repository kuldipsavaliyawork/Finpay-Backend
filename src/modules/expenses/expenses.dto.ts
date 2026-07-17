import { z } from 'zod';

/**
 * Zod request schemas for the expenses module (ExpenseCategory + Expense).
 * Controllers read the validated, typed output (see `validate` middleware) —
 * never raw req.body/query/params.
 */

const money = z.coerce.number().min(0);

// ── Expense categories ──────────────────────────────────────────────────────

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  accountId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

export const listExpenseCategoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListExpenseCategoryQuery = z.infer<typeof listExpenseCategoryQuerySchema>;

// ── Expenses ─────────────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'reimbursed'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const createExpenseSchema = z.object({
  reference: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  date: z.string().trim().optional(), // ISO date; defaults to now
  amount: money,
  taxAmount: money.default(0),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  description: z.string().trim().max(2000).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'card']).optional(),
  isReimbursable: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  receiptUrl: z.string().trim().url().max(1000).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  reference: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  date: z.string().trim().optional(),
  amount: money.optional(),
  taxAmount: money.optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  description: z.string().trim().max(2000).optional(),
  paymentMethod: z.enum(['cash', 'bank', 'card']).optional(),
  isReimbursable: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  receiptUrl: z.string().trim().url().max(1000).optional(),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  categoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  from: z.string().trim().optional(), // ISO date, inclusive
  to: z.string().trim().optional(), // ISO date, inclusive
  sortBy: z.enum(['date', 'amount', 'status', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListExpenseQuery = z.infer<typeof listExpenseQuerySchema>;

export const rejectExpenseSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;
