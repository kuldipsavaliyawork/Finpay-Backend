import { z } from 'zod';

/**
 * Zod request schemas for the budgets module. Controllers read the validated,
 * typed output (see `validate` middleware) — never raw req.body/query/params.
 */

const period = z.string().trim().regex(/^\d{4}-\d{2}$/, 'period must be in YYYY-MM format');

export const budgetLineInputSchema = z.object({
  accountId: z.string().uuid(),
  period,
  amount: z.coerce.number().finite(),
});
export type BudgetLineInput = z.infer<typeof budgetLineInputSchema>;

export const createBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  financialYear: z.string().trim().min(1).max(20),
  period: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  lines: z.array(budgetLineInputSchema).max(5000).optional(),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  financialYear: z.string().trim().min(1).max(20).optional(),
  period: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export const listBudgetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  financialYear: z.string().trim().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  sortBy: z.enum(['name', 'financialYear', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListBudgetQuery = z.infer<typeof listBudgetQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const budgetLineIdParamSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });
export type BudgetLineIdParam = z.infer<typeof budgetLineIdParamSchema>;

export const createBudgetLineSchema = budgetLineInputSchema;

export const updateBudgetLineSchema = z.object({
  accountId: z.string().uuid().optional(),
  period: period.optional(),
  amount: z.coerce.number().finite().optional(),
});
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineSchema>;

export const listBudgetLineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  accountId: z.string().uuid().optional(),
  period: z.string().trim().optional(),
});
export type ListBudgetLineQuery = z.infer<typeof listBudgetLineQuerySchema>;

export const varianceQuerySchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}$/, 'from must be in YYYY-MM format').optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}$/, 'to must be in YYYY-MM format').optional(),
  accountId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type VarianceQuery = z.infer<typeof varianceQuerySchema>;
