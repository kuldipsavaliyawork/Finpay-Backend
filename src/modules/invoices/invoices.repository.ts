import { Prisma, type PrismaClient, type Invoice, type InvoiceItem } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type InvoiceWithItems = Invoice & { items: InvoiceItem[]; customer?: { id: string; name: string } | null };

export interface ListInvoiceArgs {
  skip: number;
  take: number;
  q?: string;
  status?: string;
  customerId?: string;
  sortBy?: 'number' | 'issueDate' | 'dueDate' | 'total' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function invoiceWhere(
  tenantId: string,
  a: { q?: string; status?: string; customerId?: string },
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { tenantId, deletedAt: null };
  if (a.status) where.status = a.status;
  if (a.customerId) where.customerId = a.customerId;
  if (a.q) {
    where.OR = [
      { number: { contains: a.q, mode: 'insensitive' } },
      { customer: { name: { contains: a.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/**
 * Invoices repository — all Prisma access for the invoices module, ALWAYS
 * tenant-scoped.
 */
export const invoicesRepository = {
  list(tenantId: string, a: ListInvoiceArgs, db: Db = prisma): Promise<InvoiceWithItems[]> {
    return db.invoice.findMany({
      where: invoiceWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'issueDate']: a.sortDir ?? 'desc' },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });
  },

  count(tenantId: string, a: { q?: string; status?: string; customerId?: string }, db: Db = prisma): Promise<number> {
    return db.invoice.count({ where: invoiceWhere(tenantId, a) });
  },

  findById(tenantId: string, id: string, db: Db = prisma): Promise<InvoiceWithItems | null> {
    return db.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });
  },

  findByNumber(tenantId: string, number: string, db: Db = prisma): Promise<Invoice | null> {
    return db.invoice.findFirst({ where: { tenantId, number } });
  },

  create(data: Prisma.InvoiceUncheckedCreateInput, db: Db = prisma): Promise<Invoice> {
    return db.invoice.create({ data });
  },

  update(tenantId: string, id: string, data: Prisma.InvoiceUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.invoice.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.invoice.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
  },
};
