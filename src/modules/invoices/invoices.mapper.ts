import type { Invoice, InvoiceItem } from '@prisma/client';
import type { InvoiceWithItems } from './invoices.repository';

function itemApi(it: InvoiceItem) {
  return {
    id: it.id,
    description: it.description,
    quantity: it.quantity.toString(),
    unitPrice: it.unitPrice.toString(),
    discount: it.discount.toString(),
    taxRateId: it.taxRateId,
    taxAmount: it.taxAmount.toString(),
    lineTotal: it.lineTotal.toString(),
    accountId: it.accountId,
    sortOrder: it.sortOrder,
  };
}

/** Invoice entity -> API DTO. All Decimal money fields serialized to strings. */
export function toInvoiceApi(inv: InvoiceWithItems) {
  return {
    id: inv.id,
    number: inv.number,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? null,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    currency: inv.currency,
    subtotal: inv.subtotal.toString(),
    discountTotal: inv.discountTotal.toString(),
    taxTotal: inv.taxTotal.toString(),
    total: inv.total.toString(),
    amountPaid: inv.amountPaid.toString(),
    balanceDue: inv.balanceDue.toString(),
    notes: inv.notes,
    terms: inv.terms,
    journalEntryId: inv.journalEntryId,
    sentAt: inv.sentAt ? inv.sentAt.toISOString() : null,
    items: inv.items.map(itemApi),
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

/** Compact list-row shape (used when items aren't needed by the caller). */
export function toInvoiceListApi(inv: InvoiceWithItems) {
  const { items, ...rest } = toInvoiceApi(inv);
  void items;
  return rest;
}

export type InvoiceApi = ReturnType<typeof toInvoiceApi>;
export type { Invoice };
