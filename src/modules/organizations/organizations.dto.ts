import { z } from 'zod';

/**
 * Zod request schemas for the organizations module: tenant profile,
 * tenant settings (numbering + policy), financial years, currencies,
 * departments, branches. Controllers read the validated, typed output
 * (see `validate` middleware) — never raw req.body/query/params.
 */

// ── Tenant profile ───────────────────────────────────────────────────────────

export const updateTenantProfileSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  taxId: z.string().trim().max(60).optional(),
  baseCurrency: z.string().trim().length(3).toUpperCase().optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  logoUrl: z.string().trim().url().max(1000).optional(),
});
export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;

// ── Tenant settings (numbering prefixes + policy) ────────────────────────────

const passwordPolicySchema = z
  .object({
    minLength: z.number().int().min(4).max(128).optional(),
    requireUpper: z.boolean().optional(),
    requireNumber: z.boolean().optional(),
    requireSymbol: z.boolean().optional(),
    maxAgeDays: z.number().int().min(0).max(3650).optional(),
  })
  .optional();

export const updateTenantSettingsSchema = z.object({
  invoicePrefix: z.string().trim().min(1).max(20).optional(),
  invoiceNextNumber: z.coerce.number().int().min(1).optional(),
  billPrefix: z.string().trim().min(1).max(20).optional(),
  billNextNumber: z.coerce.number().int().min(1).optional(),
  journalPrefix: z.string().trim().min(1).max(20).optional(),
  journalNextNumber: z.coerce.number().int().min(1).optional(),
  paymentPrefix: z.string().trim().min(1).max(20).optional(),
  paymentNextNumber: z.coerce.number().int().min(1).optional(),
  passwordPolicy: passwordPolicySchema,
  lockoutThreshold: z.coerce.number().int().min(1).max(100).optional(),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440).optional(),
});
export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;

// ── Shared paging/id ─────────────────────────────────────────────────────────

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

const basePagingSchema = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
};

// ── Financial years ─────────────────────────────────────────────────────────────

export const createFinancialYearSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    startDate: z.string().trim().min(1), // ISO date
    endDate: z.string().trim().min(1), // ISO date
    status: z.enum(['open', 'closed']).optional(),
  })
  .refine((v) => new Date(v.endDate).getTime() > new Date(v.startDate).getTime(), {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });
export type CreateFinancialYearInput = z.infer<typeof createFinancialYearSchema>;

export const updateFinancialYearSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  status: z.enum(['open', 'closed']).optional(),
});
export type UpdateFinancialYearInput = z.infer<typeof updateFinancialYearSchema>;

export const listFinancialYearQuerySchema = z.object({
  ...basePagingSchema,
  status: z.enum(['open', 'closed']).optional(),
  sortBy: z.enum(['name', 'startDate', 'endDate', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListFinancialYearQuery = z.infer<typeof listFinancialYearQuerySchema>;

// ── Currencies ───────────────────────────────────────────────────────────────

export const createCurrencySchema = z.object({
  code: z.string().trim().length(3).toUpperCase(),
  name: z.string().trim().min(1).max(100),
  symbol: z.string().trim().min(1).max(10),
  rate: z.coerce.number().positive().optional(),
  isBase: z.boolean().optional(),
});
export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

export const updateCurrencySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  symbol: z.string().trim().min(1).max(10).optional(),
  rate: z.coerce.number().positive().optional(),
  isBase: z.boolean().optional(),
});
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

export const listCurrencyQuerySchema = z.object({
  ...basePagingSchema,
  isBase: z.coerce.boolean().optional(),
  sortBy: z.enum(['code', 'name', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListCurrencyQuery = z.infer<typeof listCurrencyQuerySchema>;

// ── Departments ──────────────────────────────────────────────────────────────

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(40).optional(),
  managerId: z.string().uuid().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const listDepartmentQuerySchema = z.object({
  ...basePagingSchema,
  sortBy: z.enum(['name', 'code', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListDepartmentQuery = z.infer<typeof listDepartmentQuerySchema>;

// ── Branches ─────────────────────────────────────────────────────────────────

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(40).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const listBranchQuerySchema = z.object({
  ...basePagingSchema,
  sortBy: z.enum(['name', 'code', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListBranchQuery = z.infer<typeof listBranchQuerySchema>;
