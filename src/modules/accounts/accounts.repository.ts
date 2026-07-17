import { Prisma, type PrismaClient, type Account } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListAccountArgs {
  skip: number;
  take: number;
  q?: string;
  type?: string;
  isActive?: boolean;
  parentId?: string;
  sortBy?: 'code' | 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function accountWhere(
  tenantId: string,
  a: { q?: string; type?: string; isActive?: boolean; parentId?: string },
): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = { tenantId, deletedAt: null };
  if (a.type) where.type = a.type;
  if (a.isActive !== undefined) where.isActive = a.isActive;
  if (a.parentId !== undefined) where.parentId = a.parentId;
  if (a.q) {
    where.OR = [
      { name: { contains: a.q, mode: 'insensitive' } },
      { code: { contains: a.q, mode: 'insensitive' } },
      { description: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Accounts (Chart of Accounts) repository — all Prisma access for the module,
 * ALWAYS tenant-scoped.
 */
export const accountsRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<Account | null> {
    return db.account.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findByCode(tenantId: string, code: string, db: Db = prisma): Promise<Account | null> {
    return db.account.findFirst({ where: { tenantId, code, deletedAt: null } });
  },

  list(tenantId: string, a: ListAccountArgs, db: Db = prisma): Promise<Account[]> {
    const where = accountWhere(tenantId, a);
    return db.account.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'code']: a.sortDir ?? 'asc' },
    });
  },

  count(
    tenantId: string,
    a: { q?: string; type?: string; isActive?: boolean; parentId?: string },
    db: Db = prisma,
  ): Promise<number> {
    return db.account.count({ where: accountWhere(tenantId, a) });
  },

  /** All active+inactive, non-deleted accounts for a tenant — used to build the tree. */
  listAll(
    tenantId: string,
    a: { type?: string; includeInactive?: boolean },
    db: Db = prisma,
  ): Promise<Account[]> {
    const where: Prisma.AccountWhereInput = { tenantId, deletedAt: null };
    if (a.type) where.type = a.type;
    if (!a.includeInactive) where.isActive = true;
    return db.account.findMany({ where, orderBy: { code: 'asc' } });
  },

  countChildren(tenantId: string, id: string, db: Db = prisma): Promise<number> {
    return db.account.count({ where: { tenantId, parentId: id, deletedAt: null } });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.AccountUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Account> {
    return db.account.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.AccountUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.account.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.account.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  /** Sum of journal-line debits/credits posted against an account, optionally as-of a date. */
  async sumJournalLines(
    tenantId: string,
    accountId: string,
    asOf: Date | undefined,
    db: Db = prisma,
  ): Promise<{ debit: Prisma.Decimal; credit: Prisma.Decimal }> {
    const entryFilter: Prisma.JournalEntryWhereInput = { tenantId, status: 'posted' };
    if (asOf) entryFilter.date = { lte: asOf };

    const agg = await db.journalLine.aggregate({
      where: { tenantId, accountId, entry: entryFilter },
      _sum: { debit: true, credit: true },
    });
    return {
      debit: agg._sum.debit ?? new Prisma.Decimal(0),
      credit: agg._sum.credit ?? new Prisma.Decimal(0),
    };
  },
};
