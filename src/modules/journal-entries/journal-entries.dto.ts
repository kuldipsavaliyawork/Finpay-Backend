import { z } from 'zod';

const money = z.coerce.number();

/** A single draft line. Exactly one of debit/credit should be non-zero (validated in the service). */
export const journalLineSchema = z
  .object({
    accountId: z.string().uuid(),
    debit: money.min(0).default(0),
    credit: money.min(0).default(0),
    description: z.string().trim().max(500).optional(),
  })
  .refine((l) => l.debit > 0 || l.credit > 0, {
    message: 'Each line needs a non-zero debit or credit',
  })
  .refine((l) => !(l.debit > 0 && l.credit > 0), {
    message: 'A line cannot have both a debit and a credit',
  });
export type JournalLineInput = z.infer<typeof journalLineSchema>;

export const createJournalEntrySchema = z.object({
  date: z.string().trim().optional(),
  memo: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(50).optional(),
  sourceId: z.string().uuid().optional(),
  lines: z.array(journalLineSchema).min(2),
});
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

export const updateJournalEntrySchema = z.object({
  date: z.string().trim().optional(),
  memo: z.string().trim().max(2000).optional(),
  lines: z.array(journalLineSchema).min(2).optional(),
});
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;

export const reverseJournalEntrySchema = z.object({
  date: z.string().trim().optional(),
  memo: z.string().trim().max(2000).optional(),
});
export type ReverseJournalEntryInput = z.infer<typeof reverseJournalEntrySchema>;

export const listJournalEntryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  status: z.enum(['draft', 'pending', 'posted', 'reversed']).optional(),
  source: z.string().trim().optional(),
  accountId: z.string().uuid().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(['number', 'date', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListJournalEntryQuery = z.infer<typeof listJournalEntryQuerySchema>;

export const accountHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type AccountHistoryQuery = z.infer<typeof accountHistoryQuerySchema>;

export const trialBalanceQuerySchema = z.object({
  asOf: z.string().trim().optional(),
});
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const accountIdParamSchema = z.object({ accountId: z.string().uuid() });
export type AccountIdParam = z.infer<typeof accountIdParamSchema>;
