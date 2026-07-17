import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import type { Ctx } from '../../common/http';
import { isDebitNature } from '../../common/accounting/account-nature';
import { budgetsRepository as repo } from './budgets.repository';
import type {
  CreateBudgetInput,
  UpdateBudgetInput,
  BudgetLineInput,
  UpdateBudgetLineInput,
} from './budgets.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

function monthStart(period: string): Date {
  const [y, m] = period.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, 1));
}

function monthEnd(period: string): Date {
  const [y, m] = period.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

async function assertAccountExists(tenantId: string, accountId: string) {
  const account = await repo.findAccountById(tenantId, accountId);
  if (!account) throw new NotFoundError('Account not found', { accountId });
  return account;
}

export const budgetsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      financialYear?: string;
      status?: string;
      sortBy?: 'name' | 'financialYear' | 'createdAt' | 'updatedAt';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const budget = await repo.findById(tenantId, id);
    if (!budget) throw new NotFoundError('Budget not found');
    return budget;
  },

  async getWithLines(tenantId: string, id: string) {
    const budget = await repo.findByIdWithLines(tenantId, id);
    if (!budget) throw new NotFoundError('Budget not found');
    return budget;
  },

  async create(ctx: Ctx, input: CreateBudgetInput) {
    const dupe = await repo.findByName(ctx.tenantId, input.name, input.financialYear);
    if (dupe) {
      throw new ConflictError('A budget with this name already exists for the financial year', {
        name: input.name,
        financialYear: input.financialYear,
      });
    }

    // Validate every referenced account exists (and belongs to the tenant) up front.
    if (input.lines?.length) {
      const uniqueAccountIds = Array.from(new Set(input.lines.map((l) => l.accountId)));
      await Promise.all(uniqueAccountIds.map((id) => assertAccountExists(ctx.tenantId, id)));
    }

    return prisma.$transaction(async (tx) => {
      const budget = await repo.create(
        ctx.tenantId,
        {
          name: input.name,
          financialYear: input.financialYear,
          period: input.period ?? 'monthly',
          status: input.status ?? 'draft',
          createdBy: ctx.userId,
        },
        tx,
      );

      if (input.lines?.length) {
        for (const line of input.lines) {
          await repo.createLine(
            ctx.tenantId,
            budget.id,
            { accountId: line.accountId, period: line.period, amount: new Prisma.Decimal(line.amount) },
            tx,
          );
        }
      }

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'budgets',
          entityType: 'budget',
          entityId: budget.id,
          after: budget,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return budget;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateBudgetInput) {
    const before = await this.get(ctx.tenantId, id);

    if (input.name || input.financialYear) {
      const nextName = input.name ?? before.name;
      const nextFinancialYear = input.financialYear ?? before.financialYear;
      if (nextName !== before.name || nextFinancialYear !== before.financialYear) {
        const dupe = await repo.findByName(ctx.tenantId, nextName, nextFinancialYear);
        if (dupe && dupe.id !== id) {
          throw new ConflictError('A budget with this name already exists for the financial year', {
            name: nextName,
            financialYear: nextFinancialYear,
          });
        }
      }
    }

    const data: Prisma.BudgetUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.financialYear !== undefined) data.financialYear = input.financialYear;
    if (input.period !== undefined) data.period = input.period;
    if (input.status !== undefined) data.status = input.status;

    await repo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'budgets',
      entityType: 'budget',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    // Hard delete — Budget has no soft-delete column; BudgetLine rows cascade
    // via the FK (onDelete: Cascade) so no separate line cleanup is required.
    await repo.remove(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'budgets',
      entityType: 'budget',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Budget lines ──────────────────────────────────────────────────────────
  async listLines(
    tenantId: string,
    budgetId: string,
    paging: Paging,
    filters: { accountId?: string; period?: string },
  ) {
    await this.get(tenantId, budgetId); // 404 if budget doesn't exist / wrong tenant
    const [items, total] = await Promise.all([
      repo.listLines(tenantId, budgetId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countLines(tenantId, budgetId, filters),
    ]);
    return [items, total] as const;
  },

  async getLine(tenantId: string, budgetId: string, lineId: string) {
    await this.get(tenantId, budgetId);
    const line = await repo.findLineById(tenantId, budgetId, lineId);
    if (!line) throw new NotFoundError('Budget line not found');
    return line;
  },

  async createLine(ctx: Ctx, budgetId: string, input: BudgetLineInput) {
    await this.get(ctx.tenantId, budgetId); // 404 if budget doesn't exist / wrong tenant
    await assertAccountExists(ctx.tenantId, input.accountId);

    return prisma.$transaction(async (tx) => {
      const line = await repo.createLine(
        ctx.tenantId,
        budgetId,
        { accountId: input.accountId, period: input.period, amount: new Prisma.Decimal(input.amount) },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'budgets',
          entityType: 'budget_line',
          entityId: line.id,
          after: line,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return line;
    });
  },

  async updateLine(ctx: Ctx, budgetId: string, lineId: string, input: UpdateBudgetLineInput) {
    const before = await this.getLine(ctx.tenantId, budgetId, lineId);
    if (input.accountId) await assertAccountExists(ctx.tenantId, input.accountId);

    const data: Prisma.BudgetLineUpdateInput = {};
    if (input.accountId !== undefined) data.account = { connect: { id: input.accountId } };
    if (input.period !== undefined) data.period = input.period;
    if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);

    await repo.updateLine(ctx.tenantId, budgetId, lineId, data);
    const after = await this.getLine(ctx.tenantId, budgetId, lineId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'budgets',
      entityType: 'budget_line',
      entityId: lineId,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeLine(ctx: Ctx, budgetId: string, lineId: string) {
    const before = await this.getLine(ctx.tenantId, budgetId, lineId);
    await repo.removeLine(ctx.tenantId, budgetId, lineId);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'budgets',
      entityType: 'budget_line',
      entityId: lineId,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Budget-vs-actual — for every budget line's (account, period) pair, resolve
   * the actual net movement from POSTED journal lines in that calendar month
   * and compute the variance (actual - budget) and variance %. Actuals are
   * read in the account's natural balance direction so a favorable variance
   * for an expense account (spent less than budgeted) is negative.
   */
  async varianceReport(
    tenantId: string,
    budgetId: string,
    filters: { from?: string; to?: string; accountId?: string },
    paging: Paging,
  ) {
    const budget = await this.get(tenantId, budgetId);
    const allLines = await repo.listAllLines(tenantId, budgetId);

    const filtered = allLines.filter((l) => {
      if (filters.accountId && l.accountId !== filters.accountId) return false;
      if (filters.from && l.period < filters.from) return false;
      if (filters.to && l.period > filters.to) return false;
      return true;
    });

    if (filtered.length === 0) {
      return {
        budgetId,
        financialYear: budget.financialYear,
        rows: [] as Array<Record<string, unknown>>,
        summary: { budget: '0.0000', actual: '0.0000', variance: '0.0000', variancePct: null as number | null },
        total: 0,
      };
    }

    const accountIds = Array.from(new Set(filtered.map((l) => l.accountId)));
    const accounts = await Promise.all(accountIds.map((id) => repo.findAccountById(tenantId, id)));
    const accountById = new Map(accounts.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => [a.id, a]));

    const periods = filtered.map((l) => l.period).sort();
    const from = monthStart(periods[0]);
    const to = monthEnd(periods[periods.length - 1]);

    const actuals = await repo.actualsByAccountPeriod(tenantId, { accountIds, from, to });
    const actualByKey = new Map(actuals.map((a) => [`${a.accountId}::${a.period}`, a]));

    let totalBudget = ZERO;
    let totalActual = ZERO;

    const rows = filtered
      .sort((a, b) => (a.period === b.period ? a.accountId.localeCompare(b.accountId) : a.period.localeCompare(b.period)))
      .map((line) => {
        const account = accountById.get(line.accountId);
        const key = `${line.accountId}::${line.period}`;
        const actualRow = actualByKey.get(key);
        const debit = actualRow?.debit ?? ZERO;
        const credit = actualRow?.credit ?? ZERO;
        const net = debit.minus(credit);
        const actual = account && isDebitNature(account.type) ? net : net.negated();

        const budgetAmount = line.amount;
        const variance = actual.minus(budgetAmount);
        const variancePct = budgetAmount.eq(ZERO) ? null : variance.div(budgetAmount).times(100).toDecimalPlaces(2).toNumber();

        totalBudget = totalBudget.plus(budgetAmount);
        totalActual = totalActual.plus(actual);

        return {
          lineId: line.id,
          accountId: line.accountId,
          accountCode: account?.code ?? null,
          accountName: account?.name ?? null,
          period: line.period,
          budget: budgetAmount.toString(),
          actual: actual.toString(),
          variance: variance.toString(),
          variancePct,
        };
      });

    const totalVariance = totalActual.minus(totalBudget);
    const totalVariancePct = totalBudget.eq(ZERO) ? null : totalVariance.div(totalBudget).times(100).toDecimalPlaces(2).toNumber();

    const page = rows.slice(paging.skip, paging.skip + paging.take);

    return {
      budgetId,
      financialYear: budget.financialYear,
      rows: page,
      summary: {
        budget: totalBudget.toString(),
        actual: totalActual.toString(),
        variance: totalVariance.toString(),
        variancePct: totalVariancePct,
      },
      total: rows.length,
    };
  },
};
