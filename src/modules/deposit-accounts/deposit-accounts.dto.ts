import { z } from 'zod';

/**
 * Zod request schemas for the deposit-accounts module (customer savings/current
 * accounts + internal transfers). Controllers read the validated, typed output
 * of the `validate` middleware — never raw req.body/query/params.
 */

const currency = z.string().trim().length(3).toUpperCase();

// ── Deposit accounts ─────────────────────────────────────────────────────────

export const depositAccountTypeEnum = z.enum(['savings', 'current']);
export type DepositAccountType = z.infer<typeof depositAccountTypeEnum>;

export const depositAccountStatusEnum = z.enum(['active', 'dormant', 'frozen', 'closed']);
export type DepositAccountStatus = z.infer<typeof depositAccountStatusEnum>;

export const openDepositAccountSchema = z.object({
  customerId: z.string().uuid(),
  type: depositAccountTypeEnum.optional(),
  currency: currency.optional(),
  openingBalance: z.coerce.number().finite().nonnegative().optional(),
});
export type OpenDepositAccountInput = z.infer<typeof openDepositAccountSchema>;

/** Only the status is mutable on a deposit account (freeze / dormant / close / reactivate). */
export const updateDepositAccountSchema = z.object({
  status: depositAccountStatusEnum,
});
export type UpdateDepositAccountInput = z.infer<typeof updateDepositAccountSchema>;

export const listDepositAccountQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  customerId: z.string().uuid().optional(),
  type: depositAccountTypeEnum.optional(),
  status: depositAccountStatusEnum.optional(),
  sortBy: z.enum(['accountNumber', 'balance', 'createdAt', 'openedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListDepositAccountQuery = z.infer<typeof listDepositAccountQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

// ── Deposit transactions (account statement) ─────────────────────────────────

export const listDepositTransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  type: z.enum(['credit', 'debit']).optional(),
  from: z.string().trim().optional(), // ISO date
  to: z.string().trim().optional(), // ISO date
  sortBy: z.enum(['date', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListDepositTransactionQuery = z.infer<typeof listDepositTransactionQuerySchema>;

// ── Transfers ────────────────────────────────────────────────────────────────

export const createTransferSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: z.coerce.number().finite().positive(),
    reference: z.string().trim().max(120).optional(),
    description: z.string().trim().max(280).optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: 'Source and destination accounts must differ',
    path: ['toAccountId'],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const listTransferQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  accountId: z.string().uuid().optional(), // matches either leg
  sortBy: z.enum(['createdAt', 'amount']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListTransferQuery = z.infer<typeof listTransferQuerySchema>;
