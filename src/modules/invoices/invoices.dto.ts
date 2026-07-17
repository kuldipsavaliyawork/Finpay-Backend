import { z } from 'zod';

const money = z.coerce.number().min(0);

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: money,
  discount: money.default(0),
  taxRateId: z.string().uuid().optional(),
  taxAmount: money.default(0),
  accountId: z.string().uuid().optional(),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  issueDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  issueDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const listInvoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  status: z.enum(['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled']).optional(),
  customerId: z.string().uuid().optional(),
  sortBy: z.enum(['number', 'issueDate', 'dueDate', 'total', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListInvoiceQuery = z.infer<typeof listInvoiceQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;
