import type { BankAccount, BankTransaction, Reconciliation } from '@prisma/client';

/** BankAccount entity -> API DTO. Decimal fields serialized to strings. */
export function toBankAccountApi(b: BankAccount) {
  return {
    id: b.id,
    accountId: b.accountId,
    name: b.name,
    bankName: b.bankName,
    accountNumber: b.accountNumber,
    type: b.type,
    currency: b.currency,
    currentBalance: b.currentBalance.toString(),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** BankTransaction entity -> API DTO. Decimal fields serialized to strings. */
export function toBankTransactionApi(t: BankTransaction) {
  return {
    id: t.id,
    bankAccountId: t.bankAccountId,
    date: t.date.toISOString(),
    description: t.description,
    reference: t.reference,
    amount: t.amount.toString(),
    type: t.type,
    status: t.status,
    matchedType: t.matchedType,
    matchedId: t.matchedId,
    importBatchId: t.importBatchId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Reconciliation entity -> API DTO. Decimal fields serialized to strings. */
export function toReconciliationApi(r: Reconciliation) {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    statementDate: r.statementDate.toISOString(),
    statementBalance: r.statementBalance.toString(),
    bookBalance: r.bookBalance.toString(),
    difference: r.difference.toString(),
    status: r.status,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
