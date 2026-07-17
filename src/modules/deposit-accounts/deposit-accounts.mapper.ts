import type { DepositAccount, DepositTransaction, Transfer, Customer } from '@prisma/client';

/** DepositAccount entity -> API DTO. Decimal fields serialized to strings. */
export function toDepositAccountApi(a: DepositAccount & { customer?: Pick<Customer, 'id' | 'name'> | null }) {
  return {
    id: a.id,
    customerId: a.customerId,
    customerName: a.customer?.name ?? null,
    accountNumber: a.accountNumber,
    type: a.type,
    currency: a.currency,
    balance: a.balance.toString(),
    status: a.status,
    openedAt: a.openedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** DepositTransaction entity -> API DTO (an account statement line). */
export function toDepositTransactionApi(t: DepositTransaction) {
  return {
    id: t.id,
    depositAccountId: t.depositAccountId,
    date: t.date.toISOString(),
    type: t.type,
    amount: t.amount.toString(),
    balanceAfter: t.balanceAfter.toString(),
    description: t.description,
    reference: t.reference,
    transferId: t.transferId,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Transfer entity -> API DTO. Decimal fields serialized to strings. */
export function toTransferApi(
  t: Transfer & {
    fromAccount?: Pick<DepositAccount, 'id' | 'accountNumber'> | null;
    toAccount?: Pick<DepositAccount, 'id' | 'accountNumber'> | null;
  },
) {
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    fromAccountNumber: t.fromAccount?.accountNumber ?? null,
    toAccountId: t.toAccountId,
    toAccountNumber: t.toAccount?.accountNumber ?? null,
    amount: t.amount.toString(),
    currency: t.currency,
    reference: t.reference,
    description: t.description,
    status: t.status,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
  };
}
