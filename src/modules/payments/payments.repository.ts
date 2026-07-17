import { Prisma, type PrismaClient, type Payment, type PaymentAllocation } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type PaymentWithAllocations = Payment & {
  allocations: PaymentAllocation[];
  customer?: { id: string; name: string } | null;
  vendor?: { id: string; name: string } | null;
};

export interface ListPaymentArgs {
  skip: number;
  take: number;
  q?: string;
  direction?: string;
  status?: string;
  customerId?: string;
  vendorId?: string;
  sortBy?: 'number' | 'date' | 'amount' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function paymentWhere(
  tenantId: string,
  a: { q?: string; direction?: string; status?: string; customerId?: string; vendorId?: string },
): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = { tenantId };
  if (a.direction) where.direction = a.direction;
  if (a.status) where.status = a.status;
  if (a.customerId) where.customerId = a.customerId;
  if (a.vendorId) where.vendorId = a.vendorId;
  if (a.q) {
    where.OR = [
      { number: { contains: a.q, mode: 'insensitive' } },
      { reference: { contains: a.q, mode: 'insensitive' } },
      { customer: { name: { contains: a.q, mode: 'insensitive' } } },
      { vendor: { name: { contains: a.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/**
 * Payments repository — all Prisma access for the payments module, ALWAYS
 * tenant-scoped.
 */
export const paymentsRepository = {
  list(tenantId: string, a: ListPaymentArgs, db: Db = prisma): Promise<PaymentWithAllocations[]> {
    return db.payment.findMany({
      where: paymentWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'date']: a.sortDir ?? 'desc' },
      include: {
        allocations: true,
        customer: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
  },

  count(
    tenantId: string,
    a: { q?: string; direction?: string; status?: string; customerId?: string; vendorId?: string },
    db: Db = prisma,
  ): Promise<number> {
    return db.payment.count({ where: paymentWhere(tenantId, a) });
  },

  findById(tenantId: string, id: string, db: Db = prisma): Promise<PaymentWithAllocations | null> {
    return db.payment.findFirst({
      where: { id, tenantId },
      include: {
        allocations: true,
        customer: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
  },

  create(data: Prisma.PaymentUncheckedCreateInput, db: Db = prisma): Promise<Payment> {
    return db.payment.create({ data });
  },

  updateStatus(tenantId: string, id: string, status: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.payment.updateMany({ where: { id, tenantId }, data: { status } });
  },
};
