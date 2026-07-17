import { Prisma, type PrismaClient, type TaxRate, type TaxGroup, type InvoiceItem, type BillItem } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListTaxRateArgs {
  skip: number;
  take: number;
  q?: string;
  kind?: 'output' | 'input';
  isActive?: boolean;
  sortBy?: 'name' | 'rate' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

export interface ListTaxGroupArgs {
  skip: number;
  take: number;
  q?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

export type TaxGroupWithRates = TaxGroup & { rates: { rate: TaxRate }[] };

function taxRateWhere(tenantId: string, a: { q?: string; kind?: string; isActive?: boolean }): Prisma.TaxRateWhereInput {
  const where: Prisma.TaxRateWhereInput = { tenantId, deletedAt: null };
  if (a.kind) where.kind = a.kind;
  if (a.isActive !== undefined) where.isActive = a.isActive;
  if (a.q) {
    where.OR = [{ name: { contains: a.q, mode: 'insensitive' } }, { region: { contains: a.q, mode: 'insensitive' } }];
  }
  return where;
}

function taxGroupWhere(tenantId: string, a: { q?: string; isActive?: boolean }): Prisma.TaxGroupWhereInput {
  const where: Prisma.TaxGroupWhereInput = { tenantId };
  if (a.isActive !== undefined) where.isActive = a.isActive;
  if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
  return where;
}

/**
 * Tax repository — all Prisma access for TaxRate/TaxGroup/TaxGroupRate, ALWAYS
 * tenant-scoped. Also exposes read-only helpers over InvoiceItem/BillItem
 * (owned by other modules) used to build the tax liability summary — no
 * writes to those tables here.
 */
export const taxRepository = {
  // ── Tax rates ────────────────────────────────────────────────────────────
  findRateById(tenantId: string, id: string, db: Db = prisma): Promise<TaxRate | null> {
    return db.taxRate.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findRateByName(tenantId: string, name: string, db: Db = prisma): Promise<TaxRate | null> {
    return db.taxRate.findFirst({ where: { tenantId, name, deletedAt: null } });
  },

  listRates(tenantId: string, a: ListTaxRateArgs, db: Db = prisma): Promise<TaxRate[]> {
    return db.taxRate.findMany({
      where: taxRateWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  countRates(tenantId: string, a: { q?: string; kind?: string; isActive?: boolean }, db: Db = prisma): Promise<number> {
    return db.taxRate.count({ where: taxRateWhere(tenantId, a) });
  },

  createRate(
    tenantId: string,
    data: Omit<Prisma.TaxRateUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<TaxRate> {
    return db.taxRate.create({ data: { ...data, tenantId } });
  },

  updateRate(tenantId: string, id: string, data: Prisma.TaxRateUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.taxRate.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDeleteRate(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.taxRate.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  /** Whether this rate is referenced by any invoice/bill line item (blocks hard changes if needed by callers). */
  async isRateInUse(tenantId: string, id: string, db: Db = prisma): Promise<boolean> {
    const [invoiceUse, billUse] = await Promise.all([
      db.invoiceItem.count({ where: { tenantId, taxRateId: id } }),
      db.billItem.count({ where: { tenantId, taxRateId: id } }),
    ]);
    return invoiceUse > 0 || billUse > 0;
  },

  // ── Tax groups ───────────────────────────────────────────────────────────
  findGroupById(tenantId: string, id: string, db: Db = prisma): Promise<TaxGroupWithRates | null> {
    return db.taxGroup.findFirst({
      where: { id, tenantId },
      include: { rates: { include: { rate: true } } },
    });
  },

  findGroupByName(tenantId: string, name: string, db: Db = prisma): Promise<TaxGroup | null> {
    return db.taxGroup.findFirst({ where: { tenantId, name } });
  },

  listGroups(tenantId: string, a: ListTaxGroupArgs, db: Db = prisma): Promise<TaxGroupWithRates[]> {
    return db.taxGroup.findMany({
      where: taxGroupWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
      include: { rates: { include: { rate: true } } },
    });
  },

  countGroups(tenantId: string, a: { q?: string; isActive?: boolean }, db: Db = prisma): Promise<number> {
    return db.taxGroup.count({ where: taxGroupWhere(tenantId, a) });
  },

  createGroup(tenantId: string, data: { name: string; isActive?: boolean }, db: Db = prisma): Promise<TaxGroup> {
    return db.taxGroup.create({ data: { ...data, tenantId } });
  },

  updateGroup(tenantId: string, id: string, data: Prisma.TaxGroupUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.taxGroup.updateMany({ where: { id, tenantId }, data });
  },

  deleteGroup(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    // TaxGroup has no soft-delete column; deactivate then remove the group +
    // its links (rate rows are untouched — TaxGroupRate cascades on delete).
    return db.taxGroup.deleteMany({ where: { id, tenantId } });
  },

  /** Verify every rateId belongs to this tenant and is not soft-deleted. */
  async ratesExist(tenantId: string, rateIds: string[], db: Db = prisma): Promise<boolean> {
    if (rateIds.length === 0) return true;
    const count = await db.taxRate.count({ where: { id: { in: rateIds }, tenantId, deletedAt: null } });
    return count === rateIds.length;
  },

  /** Replace the full set of rate links for a group (delete-all then recreate). */
  async setGroupRates(tenantId: string, groupId: string, rateIds: string[], db: Db = prisma): Promise<void> {
    await db.taxGroupRate.deleteMany({ where: { groupId, group: { tenantId } } });
    if (rateIds.length > 0) {
      await db.taxGroupRate.createMany({
        data: rateIds.map((rateId) => ({ groupId, rateId })),
        skipDuplicates: true,
      });
    }
  },

  addGroupRate(groupId: string, rateId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.taxGroupRate.createMany({ data: [{ groupId, rateId }], skipDuplicates: true });
  },

  removeGroupRate(groupId: string, rateId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.taxGroupRate.deleteMany({ where: { groupId, rateId } });
  },

  // ── Tax liability summary (read-only over posted invoice/bill items) ────
  /**
   * Output tax: tax collected on posted (journalEntryId set) invoice items in
   * the period, grouped by taxRateId. Period filters on the invoice issueDate.
   */
  listOutputTaxItems(
    tenantId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<Array<Pick<InvoiceItem, 'taxRateId' | 'taxAmount' | 'lineTotal'>>> {
    const invoiceDate: Prisma.DateTimeFilter = {};
    if (a.from) invoiceDate.gte = a.from;
    if (a.to) invoiceDate.lte = a.to;
    return db.invoiceItem.findMany({
      where: {
        tenantId,
        taxAmount: { gt: 0 },
        invoice: {
          tenantId,
          deletedAt: null,
          journalEntryId: { not: null },
          ...(a.from || a.to ? { issueDate: invoiceDate } : {}),
        },
      },
      select: { taxRateId: true, taxAmount: true, lineTotal: true },
    });
  },

  /**
   * Input tax: tax paid on posted (journalEntryId set) bill items in the
   * period, grouped by taxRateId. Period filters on the bill issueDate.
   */
  listInputTaxItems(
    tenantId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<Array<Pick<BillItem, 'taxRateId' | 'taxAmount' | 'lineTotal'>>> {
    const billDate: Prisma.DateTimeFilter = {};
    if (a.from) billDate.gte = a.from;
    if (a.to) billDate.lte = a.to;
    return db.billItem.findMany({
      where: {
        tenantId,
        taxAmount: { gt: 0 },
        bill: {
          tenantId,
          deletedAt: null,
          journalEntryId: { not: null },
          ...(a.from || a.to ? { issueDate: billDate } : {}),
        },
      },
      select: { taxRateId: true, taxAmount: true, lineTotal: true },
    });
  },

  /** Look up a batch of tax rates by id (for labeling summary rows). */
  findRatesByIds(tenantId: string, ids: string[], db: Db = prisma): Promise<TaxRate[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.taxRate.findMany({ where: { tenantId, id: { in: ids } } });
  },
};
