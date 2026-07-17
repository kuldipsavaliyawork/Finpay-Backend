import {
  Prisma,
  type PrismaClient,
  type DepositAccount,
  type DepositTransaction,
  type Transfer,
} from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

const customerSelect = { customer: { select: { id: true, name: true } } } as const;
const transferAccountsSelect = {
  fromAccount: { select: { id: true, accountNumber: true } },
  toAccount: { select: { id: true, accountNumber: true } },
} as const;

// ── Deposit accounts ─────────────────────────────────────────────────────────

export interface ListDepositAccountArgs {
  skip: number;
  take: number;
  q?: string;
  customerId?: string;
  type?: string;
  status?: string;
  sortBy?: 'accountNumber' | 'balance' | 'createdAt' | 'openedAt';
  sortDir?: 'asc' | 'desc';
}

function depositAccountWhere(
  tenantId: string,
  a: { q?: string; customerId?: string; type?: string; status?: string },
): Prisma.DepositAccountWhereInput {
  const where: Prisma.DepositAccountWhereInput = { tenantId, deletedAt: null };
  if (a.customerId) where.customerId = a.customerId;
  if (a.type) where.type = a.type;
  if (a.status) where.status = a.status;
  if (a.q) {
    where.OR = [
      { accountNumber: { contains: a.q, mode: 'insensitive' } },
      { customer: { name: { contains: a.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

// ── Transfers ────────────────────────────────────────────────────────────────

export interface ListTransferArgs {
  skip: number;
  take: number;
  accountId?: string;
  sortBy?: 'createdAt' | 'amount';
  sortDir?: 'asc' | 'desc';
}

function transferWhere(tenantId: string, a: { accountId?: string }): Prisma.TransferWhereInput {
  const where: Prisma.TransferWhereInput = { tenantId };
  if (a.accountId) where.OR = [{ fromAccountId: a.accountId }, { toAccountId: a.accountId }];
  return where;
}

/**
 * Deposit-accounts repository — all Prisma access for deposit accounts, their
 * statement transactions, and internal transfers. ALWAYS tenant-scoped.
 */
export const depositAccountsRepository = {
  // ── Deposit accounts ───────────────────────────────────────────────────────

  findById(tenantId: string, id: string, db: Db = prisma): Promise<DepositAccount | null> {
    return db.depositAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findByIdWithCustomer(tenantId: string, id: string, db: Db = prisma) {
    return db.depositAccount.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: customerSelect,
    });
  },

  findByAccountNumber(accountNumber: string, db: Db = prisma): Promise<DepositAccount | null> {
    return db.depositAccount.findUnique({ where: { accountNumber } });
  },

  list(tenantId: string, a: ListDepositAccountArgs, db: Db = prisma) {
    return db.depositAccount.findMany({
      where: depositAccountWhere(tenantId, a),
      include: customerSelect,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  count(
    tenantId: string,
    a: { q?: string; customerId?: string; type?: string; status?: string },
    db: Db = prisma,
  ): Promise<number> {
    return db.depositAccount.count({ where: depositAccountWhere(tenantId, a) });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.DepositAccountUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<DepositAccount> {
    return db.depositAccount.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.DepositAccountUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.depositAccount.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  /** Aggregate total balance across active accounts (for KPIs), tenant-scoped. */
  sumBalance(tenantId: string, db: Db = prisma) {
    return db.depositAccount.aggregate({
      where: { tenantId, deletedAt: null },
      _sum: { balance: true },
    });
  },

  // ── Deposit transactions (statement) ─────────────────────────────────────────

  createTransaction(
    tenantId: string,
    data: Omit<Prisma.DepositTransactionUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<DepositTransaction> {
    return db.depositTransaction.create({ data: { ...data, tenantId } });
  },

  listTransactions(
    tenantId: string,
    depositAccountId: string,
    a: { skip: number; take: number; type?: string; from?: Date; to?: Date; sortBy?: 'date' | 'createdAt'; sortDir?: 'asc' | 'desc' },
    db: Db = prisma,
  ): Promise<DepositTransaction[]> {
    const where: Prisma.DepositTransactionWhereInput = { tenantId, depositAccountId };
    if (a.type) where.type = a.type;
    if (a.from || a.to) {
      where.date = {};
      if (a.from) where.date.gte = a.from;
      if (a.to) where.date.lte = a.to;
    }
    return db.depositTransaction.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'date']: a.sortDir ?? 'desc' },
    });
  },

  countTransactions(
    tenantId: string,
    depositAccountId: string,
    a: { type?: string; from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<number> {
    const where: Prisma.DepositTransactionWhereInput = { tenantId, depositAccountId };
    if (a.type) where.type = a.type;
    if (a.from || a.to) {
      where.date = {};
      if (a.from) where.date.gte = a.from;
      if (a.to) where.date.lte = a.to;
    }
    return db.depositTransaction.count({ where });
  },

  // ── Transfers ────────────────────────────────────────────────────────────────

  createTransfer(
    tenantId: string,
    data: Omit<Prisma.TransferUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Transfer> {
    return db.transfer.create({ data: { ...data, tenantId } });
  },

  findTransferById(tenantId: string, id: string, db: Db = prisma) {
    return db.transfer.findFirst({ where: { id, tenantId }, include: transferAccountsSelect });
  },

  listTransfers(tenantId: string, a: ListTransferArgs, db: Db = prisma) {
    return db.transfer.findMany({
      where: transferWhere(tenantId, a),
      include: transferAccountsSelect,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  countTransfers(tenantId: string, a: { accountId?: string }, db: Db = prisma): Promise<number> {
    return db.transfer.count({ where: transferWhere(tenantId, a) });
  },
};
