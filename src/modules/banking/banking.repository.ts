import {
  Prisma,
  type PrismaClient,
  type BankAccount,
  type BankTransaction,
  type Reconciliation,
} from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

// ── Bank accounts ────────────────────────────────────────────────────────────

export interface ListBankAccountArgs {
  skip: number;
  take: number;
  q?: string;
  type?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function bankAccountWhere(tenantId: string, a: { q?: string; type?: string }): Prisma.BankAccountWhereInput {
  const where: Prisma.BankAccountWhereInput = { tenantId, deletedAt: null };
  if (a.type) where.type = a.type;
  if (a.q) {
    where.OR = [
      { name: { contains: a.q, mode: 'insensitive' } },
      { bankName: { contains: a.q, mode: 'insensitive' } },
      { accountNumber: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// ── Bank transactions ────────────────────────────────────────────────────────

export interface ListBankTransactionArgs {
  skip: number;
  take: number;
  q?: string;
  bankAccountId?: string;
  status?: string;
  type?: string;
  from?: Date;
  to?: Date;
  importBatchId?: string;
  sortBy?: 'date' | 'amount' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function bankTransactionWhere(
  tenantId: string,
  a: {
    q?: string;
    bankAccountId?: string;
    status?: string;
    type?: string;
    from?: Date;
    to?: Date;
    importBatchId?: string;
  },
): Prisma.BankTransactionWhereInput {
  const where: Prisma.BankTransactionWhereInput = { tenantId };
  if (a.bankAccountId) where.bankAccountId = a.bankAccountId;
  if (a.status) where.status = a.status;
  if (a.type) where.type = a.type;
  if (a.importBatchId) where.importBatchId = a.importBatchId;
  if (a.from || a.to) {
    where.date = {};
    if (a.from) where.date.gte = a.from;
    if (a.to) where.date.lte = a.to;
  }
  if (a.q) {
    where.OR = [
      { description: { contains: a.q, mode: 'insensitive' } },
      { reference: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// ── Reconciliations ──────────────────────────────────────────────────────────

export interface ListReconciliationArgs {
  skip: number;
  take: number;
  bankAccountId?: string;
  status?: string;
  sortBy?: 'statementDate' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function reconciliationWhere(
  tenantId: string,
  a: { bankAccountId?: string; status?: string },
): Prisma.ReconciliationWhereInput {
  const where: Prisma.ReconciliationWhereInput = { tenantId };
  if (a.bankAccountId) where.bankAccountId = a.bankAccountId;
  if (a.status) where.status = a.status;
  return where;
}

/**
 * Banking repository — all Prisma access for bank accounts, bank transactions
 * and reconciliations. ALWAYS tenant-scoped.
 */
export const bankingRepository = {
  // ── Bank accounts ──────────────────────────────────────────────────────────

  findBankAccountById(tenantId: string, id: string, db: Db = prisma): Promise<BankAccount | null> {
    return db.bankAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findBankAccountByCoaAccountId(tenantId: string, accountId: string, db: Db = prisma): Promise<BankAccount | null> {
    return db.bankAccount.findFirst({ where: { accountId, tenantId, deletedAt: null } });
  },

  listBankAccounts(tenantId: string, a: ListBankAccountArgs, db: Db = prisma): Promise<BankAccount[]> {
    const where = bankAccountWhere(tenantId, a);
    return db.bankAccount.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  countBankAccounts(tenantId: string, a: { q?: string; type?: string }, db: Db = prisma): Promise<number> {
    return db.bankAccount.count({ where: bankAccountWhere(tenantId, a) });
  },

  createBankAccount(
    tenantId: string,
    data: Omit<Prisma.BankAccountUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<BankAccount> {
    return db.bankAccount.create({ data: { ...data, tenantId } });
  },

  updateBankAccount(
    tenantId: string,
    id: string,
    data: Prisma.BankAccountUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.bankAccount.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDeleteBankAccount(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bankAccount.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },

  // ── Bank transactions ──────────────────────────────────────────────────────

  findBankTransactionById(tenantId: string, id: string, db: Db = prisma): Promise<BankTransaction | null> {
    return db.bankTransaction.findFirst({ where: { id, tenantId } });
  },

  listBankTransactions(tenantId: string, a: ListBankTransactionArgs, db: Db = prisma): Promise<BankTransaction[]> {
    const where = bankTransactionWhere(tenantId, a);
    return db.bankTransaction.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'date']: a.sortDir ?? 'desc' },
    });
  },

  countBankTransactions(
    tenantId: string,
    a: {
      q?: string;
      bankAccountId?: string;
      status?: string;
      type?: string;
      from?: Date;
      to?: Date;
      importBatchId?: string;
    },
    db: Db = prisma,
  ): Promise<number> {
    return db.bankTransaction.count({ where: bankTransactionWhere(tenantId, a) });
  },

  createManyBankTransactions(
    tenantId: string,
    rows: Omit<Prisma.BankTransactionUncheckedCreateInput, 'tenantId'>[],
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.bankTransaction.createMany({
      data: rows.map((r) => ({ ...r, tenantId })),
    });
  },

  updateBankTransaction(
    tenantId: string,
    id: string,
    data: Prisma.BankTransactionUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.bankTransaction.updateMany({ where: { id, tenantId }, data });
  },

  // ── Reconciliations ────────────────────────────────────────────────────────

  findReconciliationById(tenantId: string, id: string, db: Db = prisma): Promise<Reconciliation | null> {
    return db.reconciliation.findFirst({ where: { id, tenantId } });
  },

  listReconciliations(tenantId: string, a: ListReconciliationArgs, db: Db = prisma): Promise<Reconciliation[]> {
    const where = reconciliationWhere(tenantId, a);
    return db.reconciliation.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'statementDate']: a.sortDir ?? 'desc' },
    });
  },

  countReconciliations(
    tenantId: string,
    a: { bankAccountId?: string; status?: string },
    db: Db = prisma,
  ): Promise<number> {
    return db.reconciliation.count({ where: reconciliationWhere(tenantId, a) });
  },

  createReconciliation(
    tenantId: string,
    data: Omit<Prisma.ReconciliationUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Reconciliation> {
    return db.reconciliation.create({ data: { ...data, tenantId } });
  },

  updateReconciliation(
    tenantId: string,
    id: string,
    data: Prisma.ReconciliationUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.reconciliation.updateMany({ where: { id, tenantId }, data });
  },

  /** Find the in_progress reconciliation (if any) for a bank account. */
  findOpenReconciliation(tenantId: string, bankAccountId: string, db: Db = prisma): Promise<Reconciliation | null> {
    return db.reconciliation.findFirst({
      where: { tenantId, bankAccountId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    });
  },
};
