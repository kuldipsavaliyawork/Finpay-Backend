import { z } from 'zod';

/**
 * Zod request schemas for the payments module. Controllers read the
 * validated, typed output (see `validate` middleware) — never raw
 * req.body/query/params.
 */

const money = z.coerce.number().positive();

export const paymentAllocationSchema = z
  .object({
    invoiceId: z.string().uuid().optional(),
    billId: z.string().uuid().optional(),
    amount: money,
  })
  .refine((a) => (a.invoiceId ? !a.billId : !!a.billId), {
    message: 'Each allocation must reference exactly one of invoiceId or billId',
  });
export type PaymentAllocationInput = z.infer<typeof paymentAllocationSchema>;

export const createPaymentSchema = z
  .object({
    direction: z.enum(['inbound', 'outbound']),
    customerId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    bankAccountId: z.string().uuid(),
    date: z.string().trim().optional(),
    amount: money,
    currency: z.string().trim().length(3).toUpperCase().optional(),
    method: z.enum(['bank', 'cash', 'card', 'upi', 'cheque']).optional(),
    reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    allocations: z.array(paymentAllocationSchema).min(1),
  })
  .refine((v) => (v.direction === 'inbound' ? !!v.customerId : !!v.vendorId), {
    message: 'inbound payments require customerId; outbound payments require vendorId',
  })
  .refine(
    (v) =>
      v.allocations.every((a) =>
        v.direction === 'inbound' ? !!a.invoiceId && !a.billId : !!a.billId && !a.invoiceId,
      ),
    { message: 'inbound payments must allocate to invoices only; outbound payments to bills only' },
  );
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const listPaymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  customerId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  sortBy: z.enum(['number', 'date', 'amount', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListPaymentQuery = z.infer<typeof listPaymentQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;
