import type { Customer, Invoice, Payment } from '@prisma/client';

/** Customer entity -> API DTO. Decimal fields (creditLimit) serialized to strings. */
export function toCustomerApi(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    taxId: c.taxId,
    billingAddress: c.billingAddress,
    shippingAddress: c.shippingAddress,
    currency: c.currency,
    creditLimit: c.creditLimit.toString(),
    paymentTerms: c.paymentTerms,
    notes: c.notes,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export interface StatementLine {
  type: 'invoice' | 'payment';
  id: string;
  date: string;
  reference: string;
  debit: string; // increases receivable (invoices)
  credit: string; // decreases receivable (payments)
  balance: string; // running balance after this line
}

/** Invoice -> statement line (an invoice increases the amount owed by the customer). */
export function invoiceToStatementLine(
  inv: Invoice,
): { date: Date; type: 'invoice'; id: string; reference: string; amount: string } {
  return {
    date: inv.issueDate,
    type: 'invoice',
    id: inv.id,
    reference: inv.number,
    amount: inv.total.toString(),
  };
}

/** Payment -> statement line (an inbound receipt decreases the amount owed). */
export function paymentToStatementLine(
  p: Payment,
): { date: Date; type: 'payment'; id: string; reference: string; amount: string } {
  return {
    date: p.date,
    type: 'payment',
    id: p.id,
    reference: p.number,
    amount: p.amount.toString(),
  };
}

export function toInvoiceSummaryApi(inv: Invoice) {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    currency: inv.currency,
    total: inv.total.toString(),
    amountPaid: inv.amountPaid.toString(),
    balanceDue: inv.balanceDue.toString(),
  };
}
