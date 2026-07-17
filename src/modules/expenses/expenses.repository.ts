import {
  Prisma,
  type PrismaClient,
  type Expense,
  type ExpenseCategory,
} from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type ExpenseWithRelations = Expense & {
  category: ExpenseCategory | null;
  vendor: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
};

// ── Expense categories ──────────────────────────────────────────────────────

export interface ListExpenseCategoryArgs {
  skip: number;
  take: number;
  q?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function categoryWhere(
  tenantId: string,
  a: { q?: string; isActive?: boolean },
): Prisma.ExpenseCategoryWhereInput {
  const where: Prisma.ExpenseCategoryWhereInput = { tenantId };
  if (a.isActive !== undefined) where.isActive = a.isActive;
  if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
  return where;
}

export const expenseCategoriesRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<ExpenseCategory | null> {
    return db.expenseCategory.findFirst({ where: { id, tenantId } });
  },

  findByName(tenantId: string, name: string, db: Db = prisma): Promise<ExpenseCategory | null> {
    return db.expenseCategory.findFirst({ where: { tenantId, name } });
  },

  list(tenantId: string, a: ListExpenseCategoryArgs, db: Db = prisma): Promise<ExpenseCategory[]> {
    return db.expenseCategory.findMany({
      where: categoryWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'name']: a.sortDir ?? 'asc' },
    });
  },

  count(tenantId: string, a: { q?: string; isActive?: boolean }, db: Db = prisma): Promise<number> {
    return db.expenseCategory.count({ where: categoryWhere(tenantId, a) });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.ExpenseCategoryUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<ExpenseCategory> {
    return db.expenseCategory.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.ExpenseCategoryUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.expenseCategory.updateMany({ where: { id, tenantId }, data });
  },

  /** Categories have no soft-delete column — hard delete is guarded by usage check in the service. */
  remove(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.expenseCategory.deleteMany({ where: { id, tenantId } });
  },

  countExpensesUsingCategory(tenantId: string, categoryId: string, db: Db = prisma): Promise<number> {
    return db.expense.count({ where: { tenantId, categoryId, deletedAt: null } });
  },
};

// ── Expenses ─────────────────────────────────────────────────────────────────

export interface ListExpenseArgs {
  skip: number;
  take: number;
  q?: string;
  status?: string;
  categoryId?: string;
  vendorId?: string;
  departmentId?: string;
  from?: Date;
  to?: Date;
  sortBy?: 'date' | 'amount' | 'status' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function expenseWhere(
  tenantId: string,
  a: {
    q?: string;
    status?: string;
    categoryId?: string;
    vendorId?: string;
    departmentId?: string;
    from?: Date;
    to?: Date;
  },
): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { tenantId, deletedAt: null };
  if (a.status) where.status = a.status;
  if (a.categoryId) where.categoryId = a.categoryId;
  if (a.vendorId) where.vendorId = a.vendorId;
  if (a.departmentId) where.departmentId = a.departmentId;
  if (a.from || a.to) {
    where.date = {};
    if (a.from) where.date.gte = a.from;
    if (a.to) where.date.lte = a.to;
  }
  if (a.q) {
    where.OR = [
      { reference: { contains: a.q, mode: 'insensitive' } },
      { description: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

const relationsInclude = {
  category: true,
  vendor: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

export const expensesRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<ExpenseWithRelations | null> {
    return db.expense.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: relationsInclude,
    });
  },

  list(tenantId: string, a: ListExpenseArgs, db: Db = prisma): Promise<ExpenseWithRelations[]> {
    return db.expense.findMany({
      where: expenseWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'date']: a.sortDir ?? 'desc' },
      include: relationsInclude,
    });
  },

  count(
    tenantId: string,
    a: {
      q?: string;
      status?: string;
      categoryId?: string;
      vendorId?: string;
      departmentId?: string;
      from?: Date;
      to?: Date;
    },
    db: Db = prisma,
  ): Promise<number> {
    return db.expense.count({ where: expenseWhere(tenantId, a) });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.ExpenseUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Expense> {
    return db.expense.create({ data: { ...data, tenantId } });
  },

  update(
    tenantId: string,
    id: string,
    data: Prisma.ExpenseUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.expense.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDelete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.expense.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
  },
};
