import { Prisma, type PrismaClient, type Vendor, type Bill, type Payment } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListVendorArgs {
  skip: number;
  take: number;
  q?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function vendorWhere(tenantId: string, a: { q?: string; isActive?: boolean }): Prisma.VendorWhereInput {
  const where: Prisma.VendorWhereInput = { tenantId, deletedAt: null };
  if (a.isActive !== undefined) where.isActive = a.isActive;
  if (a.q) {
    where.OR = [
      { name: { contains: a.q, mode: 'insensitive' } },
      { displayName: { contains: a.q, mode: 'insensitive' } },
      { email: { contains: a.q, mode: 'insensitive' } },
      { taxId: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Vendors repository — all Prisma access for the vendors module, ALWAYS
 * tenant-scoped. Also exposes read helpers for vendor bills/payments used by
 * the statement + payable-aging reports (Bill/Payment are owned by other
 * modules but read-only access here is fine — no writes to those tables).
 */
export const vendorsRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<Vendor | null> {
    return db.vendor.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  list(tenantId: string, a: ListVendorArgs, db: Db = prisma): Promise<Vendor[]> {
    const where = vendorWhere(tenantId, a);
    return db.vendor.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  count(tenantId: string, a: { q?: string; isActive?: boolean }, db: Db = prisma): Promise<number> {
    return db.vendor.count({ where: vendorWhere(tenantId, a) });
  },

  findByName(tenantId: string, name: string, db: Db = prisma): Promise<Vendor | null> {
    return db.vendor.findFirst({ where: { tenantId, name, deletedAt: null } });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.VendorUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Vendor> {
    return db.vendor.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.VendorUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.vendor.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.vendor.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  // ── Statement (bills + payments for a vendor, chronological) ─────────────
  listBillsForStatement(
    tenantId: string,
    vendorId: string,
    a: { from?: Date; to?: Date; skip: number; take: number },
    db: Db = prisma,
  ): Promise<Bill[]> {
    const where: Prisma.BillWhereInput = { tenantId, vendorId, deletedAt: null };
    if (a.from || a.to) {
      where.issueDate = {};
      if (a.from) where.issueDate.gte = a.from;
      if (a.to) where.issueDate.lte = a.to;
    }
    return db.bill.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { issueDate: 'asc' },
    });
  },

  countBillsForStatement(
    tenantId: string,
    vendorId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<number> {
    const where: Prisma.BillWhereInput = { tenantId, vendorId, deletedAt: null };
    if (a.from || a.to) {
      where.issueDate = {};
      if (a.from) where.issueDate.gte = a.from;
      if (a.to) where.issueDate.lte = a.to;
    }
    return db.bill.count({ where });
  },

  listPaymentsForStatement(
    tenantId: string,
    vendorId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<Payment[]> {
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      vendorId,
      direction: 'outbound',
      status: { not: 'failed' },
    };
    if (a.from || a.to) {
      where.date = {};
      if (a.from) where.date.gte = a.from;
      if (a.to) where.date.lte = a.to;
    }
    return db.payment.findMany({ where, orderBy: { date: 'asc' } });
  },

  // ── Payable aging ──────────────────────────────────────────────────────────
  /** Open (unpaid/partial) bills, optionally for a single vendor, for aging buckets. */
  listOpenBills(
    tenantId: string,
    a: { vendorId?: string; skip?: number; take?: number },
    db: Db = prisma,
  ): Promise<Bill[]> {
    const where: Prisma.BillWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ['paid', 'cancelled', 'draft'] },
      balanceDue: { gt: 0 },
    };
    if (a.vendorId) where.vendorId = a.vendorId;
    return db.bill.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { dueDate: 'asc' },
      include: { vendor: true },
    });
  },

  countOpenBills(tenantId: string, a: { vendorId?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.BillWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ['paid', 'cancelled', 'draft'] },
      balanceDue: { gt: 0 },
    };
    if (a.vendorId) where.vendorId = a.vendorId;
    return db.bill.count({ where });
  },
};

export type VendorWithBills = Bill & { vendor: Vendor };
