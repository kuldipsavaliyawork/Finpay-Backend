import { Prisma, type PrismaClient, type Budget, type BudgetLine } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListBudgetArgs {
  skip: number;
  take: number;
  q?: string;
  financialYear?: string;
  status?: string;
  sortBy?: 'name' | 'financialYear' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function budgetWhere(
  tenantId: string,
  a: { q?: string; financialYear?: string; status?: string },
): Prisma.BudgetWhereInput {
  const where: Prisma.BudgetWhereInput = { tenantId };
  if (a.financialYear) where.financialYear = a.financialYear;
  if (a.status) where.status = a.status;
  if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
  return where;
}

/**
 * Budgets repository — all Prisma access for the budgets module, ALWAYS
 * tenant-scoped. Budget has no soft-delete column (see schema), so `remove`
 * hard-deletes; BudgetLine cascades via the FK (`onDelete: Cascade`).
 */
export const budgetsRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<Budget | null> {
    return db.budget.findFirst({ where: { id, tenantId } });
  },

  findByIdWithLines(
    tenantId: string,
    id: string,
    db: Db = prisma,
  ): Promise<(Budget & { lines: BudgetLine[] }) | null> {
    return db.budget.findFirst({ where: { id, tenantId }, include: { lines: true } });
  },

  list(tenantId: string, a: ListBudgetArgs, db: Db = prisma): Promise<Budget[]> {
    const where = budgetWhere(tenantId, a);
    return db.budget.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  count(tenantId: string, a: { q?: string; financialYear?: string; status?: string }, db: Db = prisma): Promise<number> {
    return db.budget.count({ where: budgetWhere(tenantId, a) });
  },

  findByName(tenantId: string, name: string, financialYear: string, db: Db = prisma): Promise<Budget | null> {
    return db.budget.findFirst({ where: { tenantId, name, financialYear } });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.BudgetUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Budget> {
    return db.budget.create({ data: { ...data, tenantId } });
  },

  update(tenantId: string, id: string, data: Prisma.BudgetUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.budget.updateMany({ where: { id, tenantId }, data });
  },

  remove(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.budget.deleteMany({ where: { id, tenantId } });
  },

  // ── Budget lines ──────────────────────────────────────────────────────────
  findLineById(tenantId: string, budgetId: string, lineId: string, db: Db = prisma): Promise<BudgetLine | null> {
    return db.budgetLine.findFirst({ where: { id: lineId, budgetId, tenantId } });
  },

  listLines(
    tenantId: string,
    budgetId: string,
    a: { skip: number; take: number; accountId?: string; period?: string },
    db: Db = prisma,
  ): Promise<BudgetLine[]> {
    const where: Prisma.BudgetLineWhereInput = { tenantId, budgetId };
    if (a.accountId) where.accountId = a.accountId;
    if (a.period) where.period = a.period;
    return db.budgetLine.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: [{ period: 'asc' }, { createdAt: 'asc' } as never],
    });
  },

  countLines(
    tenantId: string,
    budgetId: string,
    a: { accountId?: string; period?: string },
    db: Db = prisma,
  ): Promise<number> {
    const where: Prisma.BudgetLineWhereInput = { tenantId, budgetId };
    if (a.accountId) where.accountId = a.accountId;
    if (a.period) where.period = a.period;
    return db.budgetLine.count({ where });
  },

  /** All lines for a budget (no paging) — used by the budget-vs-actual report. */
  listAllLines(tenantId: string, budgetId: string, db: Db = prisma): Promise<BudgetLine[]> {
    return db.budgetLine.findMany({ where: { tenantId, budgetId }, orderBy: { period: 'asc' } });
  },

  createLine(
    tenantId: string,
    budgetId: string,
    data: { accountId: string; period: string; amount: Prisma.Decimal },
    db: Db = prisma,
  ): Promise<BudgetLine> {
    return db.budgetLine.create({ data: { ...data, budgetId, tenantId } });
  },

  updateLine(
    tenantId: string,
    budgetId: string,
    lineId: string,
    data: Prisma.BudgetLineUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.budgetLine.updateMany({ where: { id: lineId, budgetId, tenantId }, data });
  },

  removeLine(tenantId: string, budgetId: string, lineId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.budgetLine.deleteMany({ where: { id: lineId, budgetId, tenantId } });
  },

  findAccountById(tenantId: string, accountId: string, db: Db = prisma) {
    return db.account.findFirst({ where: { id: accountId, tenantId, deletedAt: null } });
  },

  /**
   * Actuals per account, bucketed by calendar month (YYYY-MM), derived from
   * POSTED journal lines only within [from, to] (inclusive). Returns the raw
   * Sum(debit)/Sum(credit) per account+period; the service interprets the net
   * against each account's natural balance side (see reportsService.isDebitNature).
   */
  async actualsByAccountPeriod(
    tenantId: string,
    args: { accountIds: string[]; from: Date; to: Date },
  ): Promise<Array<{ accountId: string; period: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>> {
    if (args.accountIds.length === 0) return [];
    const rows = await prisma.$queryRaw<
      Array<{ accountId: string; period: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT jl."accountId"                              AS "accountId",
             to_char(je."date", 'YYYY-MM')                AS "period",
             COALESCE(SUM(jl.debit), 0)                   AS "debit",
             COALESCE(SUM(jl.credit), 0)                  AS "credit"
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl."entryId"
      WHERE jl."tenantId" = ${tenantId}::uuid
        AND jl."accountId" IN (${Prisma.join(args.accountIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND je.status = 'posted'
        AND je."date" >= ${args.from}
        AND je."date" <= ${args.to}
      GROUP BY jl."accountId", to_char(je."date", 'YYYY-MM')
    `);
    return rows.map((r) => ({
      accountId: r.accountId,
      period: r.period,
      debit: new Prisma.Decimal(r.debit ?? 0),
      credit: new Prisma.Decimal(r.credit ?? 0),
    }));
  },
};
