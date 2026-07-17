import { Prisma, type PrismaClient, type Customer, type Invoice, type Payment } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListCustomerArgs {
  skip: number;
  take: number;
  q?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function customerWhere(tenantId: string, a: { q?: string; isActive?: boolean }): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
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
 * Customers repository — all Prisma access for the customers module, ALWAYS
 * tenant-scoped. Also exposes read helpers for customer invoices/payments
 * used by the statement + receivable-aging reports (Invoice/Payment are
 * owned by other modules but read-only access here is fine — no writes to
 * those tables).
 */
export const customersRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<Customer | null> {
    return db.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  list(tenantId: string, a: ListCustomerArgs, db: Db = prisma): Promise<Customer[]> {
    const where = customerWhere(tenantId, a);
    return db.customer.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  count(tenantId: string, a: { q?: string; isActive?: boolean }, db: Db = prisma): Promise<number> {
    return db.customer.count({ where: customerWhere(tenantId, a) });
  },

  findByName(tenantId: string, name: string, db: Db = prisma): Promise<Customer | null> {
    return db.customer.findFirst({ where: { tenantId, name, deletedAt: null } });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.CustomerUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Customer> {
    return db.customer.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.CustomerUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.customer.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  // ── Statement (invoices + payments for a customer, chronological) ────────
  listInvoicesForStatement(
    tenantId: string,
    customerId: string,
    a: { from?: Date; to?: Date; skip: number; take: number },
    db: Db = prisma,
  ): Promise<Invoice[]> {
    const where: Prisma.InvoiceWhereInput = { tenantId, customerId, deletedAt: null };
    if (a.from || a.to) {
      where.issueDate = {};
      if (a.from) where.issueDate.gte = a.from;
      if (a.to) where.issueDate.lte = a.to;
    }
    return db.invoice.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { issueDate: 'asc' },
    });
  },

  countInvoicesForStatement(
    tenantId: string,
    customerId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<number> {
    const where: Prisma.InvoiceWhereInput = { tenantId, customerId, deletedAt: null };
    if (a.from || a.to) {
      where.issueDate = {};
      if (a.from) where.issueDate.gte = a.from;
      if (a.to) where.issueDate.lte = a.to;
    }
    return db.invoice.count({ where });
  },

  listPaymentsForStatement(
    tenantId: string,
    customerId: string,
    a: { from?: Date; to?: Date },
    db: Db = prisma,
  ): Promise<Payment[]> {
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      customerId,
      direction: 'inbound',
      status: { not: 'failed' },
    };
    if (a.from || a.to) {
      where.date = {};
      if (a.from) where.date.gte = a.from;
      if (a.to) where.date.lte = a.to;
    }
    return db.payment.findMany({ where, orderBy: { date: 'asc' } });
  },

  // ── Receivable aging ────────────────────────────────────────────────────
  /** Open (unpaid/partial) invoices, optionally for a single customer, for aging buckets. */
  listOpenInvoices(
    tenantId: string,
    a: { customerId?: string; skip?: number; take?: number },
    db: Db = prisma,
  ): Promise<Invoice[]> {
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ['paid', 'cancelled', 'draft'] },
      balanceDue: { gt: 0 },
    };
    if (a.customerId) where.customerId = a.customerId;
    return db.invoice.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { dueDate: 'asc' },
      include: { customer: true },
    });
  },

  countOpenInvoices(tenantId: string, a: { customerId?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      deletedAt: null,
      status: { notIn: ['paid', 'cancelled', 'draft'] },
      balanceDue: { gt: 0 },
    };
    if (a.customerId) where.customerId = a.customerId;
    return db.invoice.count({ where });
  },
};

export type CustomerWithInvoices = Invoice & { customer: Customer };
