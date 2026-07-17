import type { Payment, PaymentAllocation } from '@prisma/client';
import type { PaymentWithAllocations } from './payments.repository';

function allocationApi(a: PaymentAllocation) {
  return {
    id: a.id,
    invoiceId: a.invoiceId,
    billId: a.billId,
    amount: a.amount.toString(),
  };
}

/** Payment entity -> API DTO. All Decimal money fields serialized to strings. */
export function toPaymentApi(p: PaymentWithAllocations) {
  return {
    id: p.id,
    number: p.number,
    direction: p.direction,
    customerId: p.customerId,
    customerName: p.customer?.name ?? null,
    vendorId: p.vendorId,
    vendorName: p.vendor?.name ?? null,
    bankAccountId: p.bankAccountId,
    date: p.date.toISOString(),
    amount: p.amount.toString(),
    currency: p.currency,
    method: p.method,
    reference: p.reference,
    status: p.status,
    notes: p.notes,
    journalEntryId: p.journalEntryId,
    allocations: p.allocations.map(allocationApi),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Compact list-row shape (used when allocations aren't needed by the caller). */
export function toPaymentListApi(p: PaymentWithAllocations) {
  const { allocations, ...rest } = toPaymentApi(p);
  void allocations;
  return rest;
}

export type PaymentApi = ReturnType<typeof toPaymentApi>;
export type { Payment };
