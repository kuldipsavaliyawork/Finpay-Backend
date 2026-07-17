import type { BillItem } from '@prisma/client';
import type { BillWithItems } from './bills.repository';

function itemApi(it: BillItem) {
  return {
    id: it.id,
    description: it.description,
    quantity: it.quantity.toString(),
    unitPrice: it.unitPrice.toString(),
    taxRateId: it.taxRateId,
    taxAmount: it.taxAmount.toString(),
    lineTotal: it.lineTotal.toString(),
    accountId: it.accountId,
    sortOrder: it.sortOrder,
  };
}

/** Bill entity -> API DTO. All Decimal money fields serialized to strings. */
export function toBillApi(bill: BillWithItems) {
  return {
    id: bill.id,
    number: bill.number,
    vendorId: bill.vendorId,
    vendorName: bill.vendor?.name ?? null,
    status: bill.status,
    issueDate: bill.issueDate.toISOString(),
    dueDate: bill.dueDate.toISOString(),
    currency: bill.currency,
    subtotal: bill.subtotal.toString(),
    taxTotal: bill.taxTotal.toString(),
    total: bill.total.toString(),
    amountPaid: bill.amountPaid.toString(),
    balanceDue: bill.balanceDue.toString(),
    notes: bill.notes,
    journalEntryId: bill.journalEntryId,
    items: bill.items.map(itemApi),
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

/** Compact list-row shape (used when items aren't needed by the caller). */
export function toBillListApi(bill: BillWithItems) {
  const { items, ...rest } = toBillApi(bill);
  void items;
  return rest;
}

export type BillApi = ReturnType<typeof toBillApi>;
