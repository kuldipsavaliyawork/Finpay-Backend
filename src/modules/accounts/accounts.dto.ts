import { z } from 'zod';

/**
 * Zod request schemas for the accounts (Chart of Accounts) module. Controllers
 * read the validated, typed output (see `validate` middleware) — never raw
 * req.body/query/params.
 */

const currency = z.string().trim().length(3).toUpperCase();

export const accountTypeEnum = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
export type AccountType = z.infer<typeof accountTypeEnum>;

export const createAccountSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  type: accountTypeEnum,
  subtype: z.string().trim().max(60).optional(),
  parentId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  isSystem: z.boolean().optional(),
  openingBalance: z.coerce.number().finite().optional(),
  currency: currency.optional(),
  description: z.string().trim().max(2000).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Structural fields (code/type) can be changed on a plain update; parentId is
// re-validated for cycles in the service. isSystem is NOT patchable here —
// only set at creation — to keep the system-account flag trustworthy.
export const updateAccountSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  type: accountTypeEnum.optional(),
  subtype: z.string().trim().max(60).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  currency: currency.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  openingBalance: z.coerce.number().finite().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const listAccountQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  type: accountTypeEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  parentId: z.string().uuid().optional(),
  sortBy: z.enum(['code', 'name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListAccountQuery = z.infer<typeof listAccountQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const treeQuerySchema = z.object({
  type: accountTypeEnum.optional(),
  includeInactive: z.coerce.boolean().optional(),
});
export type TreeQuery = z.infer<typeof treeQuerySchema>;

export const balanceQuerySchema = z.object({
  asOf: z.string().trim().optional(), // ISO date; balance is cumulative through this date
});
export type BalanceQuery = z.infer<typeof balanceQuerySchema>;
