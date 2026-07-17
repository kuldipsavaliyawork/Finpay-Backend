import { z } from 'zod';

/**
 * Zod request schemas for the customers module. Controllers read the
 * validated, typed output (see `validate` middleware) — never raw
 * req.body/query/params.
 */

const currency = z.string().trim().length(3).toUpperCase();
const money = z.coerce.number().min(0);

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  taxId: z.string().trim().max(60).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shippingAddress: z.string().trim().max(500).optional(),
  currency: currency.optional(),
  creditLimit: money.optional(),
  paymentTerms: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>;

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
  customerId: z.string().uuid().optional(), // when omitted, aging is across all customers
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AgingQuery = z.infer<typeof agingQuerySchema>;
