import { z } from 'zod';

/**
 * Zod request schemas for the tax module (TaxRate + TaxGroup + tax liability
 * report). Controllers read the validated, typed output (see `validate`
 * middleware) — never raw req.body/query/params.
 */

// ── Tax rates ────────────────────────────────────────────────────────────────

export const createTaxRateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rate: z.coerce.number().min(0).max(100),
  kind: z.enum(['output', 'input']).optional(),
  region: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;

export const updateTaxRateSchema = createTaxRateSchema.partial();
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;

export const listTaxRateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  kind: z.enum(['output', 'input']).optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'rate', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListTaxRateQuery = z.infer<typeof listTaxRateQuerySchema>;

// ── Tax groups ───────────────────────────────────────────────────────────────

export const createTaxGroupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  isActive: z.boolean().optional(),
  rateIds: z.array(z.string().uuid()).optional(),
});
export type CreateTaxGroupInput = z.infer<typeof createTaxGroupSchema>;

export const updateTaxGroupSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTaxGroupInput = z.infer<typeof updateTaxGroupSchema>;

export const listTaxGroupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListTaxGroupQuery = z.infer<typeof listTaxGroupQuerySchema>;

export const setGroupRatesSchema = z.object({
  rateIds: z.array(z.string().uuid()),
});
export type SetGroupRatesInput = z.infer<typeof setGroupRatesSchema>;

export const groupRateParamSchema = z.object({
  id: z.string().uuid(),
  rateId: z.string().uuid(),
});
export type GroupRateParam = z.infer<typeof groupRateParamSchema>;

// ── Shared params ────────────────────────────────────────────────────────────

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

// ── Tax liability summary ───────────────────────────────────────────────────

export const taxLiabilityQuerySchema = z.object({
  from: z.string().trim().optional(), // ISO date, inclusive
  to: z.string().trim().optional(), // ISO date, inclusive
});
export type TaxLiabilityQuery = z.infer<typeof taxLiabilityQuerySchema>;
