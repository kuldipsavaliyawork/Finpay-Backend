import { z } from 'zod';

/**
 * Zod request schemas for the banking module (bank accounts, bank transactions,
 * CSV import, matching, reconciliation). Controllers read the validated, typed
 * output (see `validate` middleware) — never raw req.body/query/params.
 */

const currency = z.string().trim().length(3).toUpperCase();

// ── Bank accounts ───────────────────────────────────────────────────────────

export const bankAccountTypeEnum = z.enum(['bank', 'cash']);
export type BankAccountType = z.infer<typeof bankAccountTypeEnum>;

export const createBankAccountSchema = z.object({
  accountId: z.string().uuid(), // maps to a COA asset Account
  name: z.string().trim().min(1).max(200),
  bankName: z.string().trim().max(200).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  type: bankAccountTypeEnum.optional(),
  currency: currency.optional(),
  currentBalance: z.coerce.number().finite().optional(),
});
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;

export const updateBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  bankName: z.string().trim().max(200).nullable().optional(),
  accountNumber: z.string().trim().max(60).nullable().optional(),
  type: bankAccountTypeEnum.optional(),
  currency: currency.optional(),
});
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

export const listBankAccountQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  type: bankAccountTypeEnum.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListBankAccountQuery = z.infer<typeof listBankAccountQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

// ── Bank transactions ────────────────────────────────────────────────────────

export const bankTransactionTypeEnum = z.enum(['credit', 'debit']);
export const bankTransactionStatusEnum = z.enum(['unmatched', 'matched', 'ignored']);

export const listBankTransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  bankAccountId: z.string().uuid().optional(),
  status: bankTransactionStatusEnum.optional(),
  type: bankTransactionTypeEnum.optional(),
  from: z.string().trim().optional(), // ISO date
  to: z.string().trim().optional(), // ISO date
  importBatchId: z.string().uuid().optional(),
  sortBy: z.enum(['date', 'amount', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListBankTransactionQuery = z.infer<typeof listBankTransactionQuerySchema>;

// ── CSV import ───────────────────────────────────────────────────────────────

/**
 * CSV is submitted as raw text in the JSON body (no multipart/file-upload
 * middleware exists in the foundation yet). Expected header row:
 *   date,description,reference,amount,type
 * `type` is optional — if omitted, sign of `amount` determines credit/debit.
 */
export const importCsvSchema = z.object({
  bankAccountId: z.string().uuid(),
  csv: z.string().trim().min(1).max(2_000_000),
});
export type ImportCsvInput = z.infer<typeof importCsvSchema>;

// ── Match / unmatch ──────────────────────────────────────────────────────────

export const matchedTypeEnum = z.enum(['payment', 'expense', 'journal']);
export type MatchedType = z.infer<typeof matchedTypeEnum>;

export const matchTransactionSchema = z.object({
  matchedType: matchedTypeEnum,
  matchedId: z.string().uuid(),
});
export type MatchTransactionInput = z.infer<typeof matchTransactionSchema>;

// ── Reconciliation ───────────────────────────────────────────────────────────

export const createReconciliationSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.string().trim().min(1), // ISO date
  statementBalance: z.coerce.number().finite(),
});
export type CreateReconciliationInput = z.infer<typeof createReconciliationSchema>;

export const listReconciliationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  bankAccountId: z.string().uuid().optional(),
  status: z.enum(['in_progress', 'completed']).optional(),
  sortBy: z.enum(['statementDate', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListReconciliationQuery = z.infer<typeof listReconciliationQuerySchema>;
