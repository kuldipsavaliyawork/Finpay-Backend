import { z } from 'zod';

/**
 * Zod request schemas for the vendors module. Controllers read the validated,
 * typed output (see `validate` middleware) — never raw req.body/query/params.
 */

const currency = z.string().trim().length(3).toUpperCase();

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  taxId: z.string().trim().max(60).optional(),
  address: z.string().trim().max(500).optional(),
  currency: currency.optional(),
  paymentTerms: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = createVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const listVendorQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListVendorQuery = z.infer<typeof listVendorQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const statementQuerySchema = z.object({
  from: z.string().trim().optional(), // ISO date, inclusive
  to: z.string().trim().optional(), // ISO date, inclusive
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type StatementQuery = z.infer<typeof statementQuerySchema>;

export const agingQuerySchema = z.object({
  asOf: z.string().trim().optional(), // ISO date; defaults to now
  vendorId: z.string().uuid().optional(), // when omitted, aging is across all vendors
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AgingQuery = z.infer<typeof agingQuerySchema>;
