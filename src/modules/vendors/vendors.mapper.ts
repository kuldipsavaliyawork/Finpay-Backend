import type { Vendor, Bill, Payment } from '@prisma/client';

/** Vendor entity -> API DTO. Decimal-free (Vendor carries no money fields itself). */
export function toVendorApi(v: Vendor) {
  return {
    id: v.id,
    name: v.name,
    displayName: v.displayName,
    email: v.email,
    phone: v.phone,
    taxId: v.taxId,
    address: v.address,
    currency: v.currency,
    paymentTerms: v.paymentTerms,
    notes: v.notes,
    isActive: v.isActive,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export interface StatementLine {
  type: 'bill' | 'payment';
  id: string;
  date: string;
  reference: string;
  debit: string; // increases payable (bills)
  credit: string; // decreases payable (payments)
  balance: string; // running balance after this line
}

/** Bill -> statement line (a bill increases the amount owed to the vendor). */
export function billToStatementLine(b: Bill): { date: Date; type: 'bill'; id: string; reference: string; amount: string } {
  return {
    date: b.issueDate,
    type: 'bill',
    id: b.id,
    reference: b.number,
    amount: b.total.toString(),
  };
}

/** Payment -> statement line (an outbound payment decreases the amount owed). */
export function paymentToStatementLine(p: Payment): { date: Date; type: 'payment'; id: string; reference: string; amount: string } {
  return {
    date: p.date,
    type: 'payment',
    id: p.id,
    reference: p.number,
    amount: p.amount.toString(),
  };
}

export function toBillSummaryApi(b: Bill) {
  return {
    id: b.id,
    number: b.number,
    status: b.status,
    issueDate: b.issueDate.toISOString(),
    dueDate: b.dueDate.toISOString(),
    currency: b.currency,
    total: b.total.toString(),
    amountPaid: b.amountPaid.toString(),
    balanceDue: b.balanceDue.toString(),
  };
}
