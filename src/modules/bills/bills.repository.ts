import { Prisma, type PrismaClient, type Bill, type BillItem } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type BillWithItems = Bill & { items: BillItem[]; vendor?: { id: string; name: string } | null };

export interface ListBillArgs {
  skip: number;
  take: number;
  q?: string;
  status?: string;
  vendorId?: string;
  sortBy?: 'number' | 'issueDate' | 'dueDate' | 'total' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function billWhere(
  tenantId: string,
  a: { q?: string; status?: string; vendorId?: string },
): Prisma.BillWhereInput {
  const where: Prisma.BillWhereInput = { tenantId, deletedAt: null };
  if (a.status) where.status = a.status;
  if (a.vendorId) where.vendorId = a.vendorId;
  if (a.q) {
    where.OR = [
      { number: { contains: a.q, mode: 'insensitive' } },
      { vendor: { name: { contains: a.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/**
 * Bills repository — all Prisma access for the bills module (accounts
 * payable), ALWAYS tenant-scoped.
 */
export const billsRepository = {
  list(tenantId: string, a: ListBillArgs, db: Db = prisma): Promise<BillWithItems[]> {
    return db.bill.findMany({
      where: billWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'issueDate']: a.sortDir ?? 'desc' },
      include: { items: true, vendor: { select: { id: true, name: true } } },
    });
  },

  count(tenantId: string, a: { q?: string; status?: string; vendorId?: string }, db: Db = prisma): Promise<number> {
    return db.bill.count({ where: billWhere(tenantId, a) });
  },

  findById(tenantId: string, id: string, db: Db = prisma): Promise<BillWithItems | null> {
    return db.bill.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true, vendor: { select: { id: true, name: true } } },
    });
  },

  findByNumber(tenantId: string, number: string, db: Db = prisma): Promise<Bill | null> {
    return db.bill.findFirst({ where: { tenantId, number } });
  },

  create(data: Prisma.BillUncheckedCreateInput, db: Db = prisma): Promise<Bill> {
    return db.bill.create({ data });
  },

  update(tenantId: string, id: string, data: Prisma.BillUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bill.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.bill.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
  },
};
