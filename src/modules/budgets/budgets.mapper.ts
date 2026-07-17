import type { Budget, BudgetLine, Account } from '@prisma/client';

/** Budget entity -> API DTO. Money-free itself (lines carry the Decimal amounts). */
export function toBudgetApi(b: Budget) {
  return {
    id: b.id,
    name: b.name,
    financialYear: b.financialYear,
    period: b.period,
    status: b.status,
    createdBy: b.createdBy,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function toBudgetWithLinesApi(b: Budget & { lines: BudgetLine[] }) {
  return {
    ...toBudgetApi(b),
    lines: b.lines.map(toBudgetLineApi),
  };
}

/** BudgetLine entity -> API DTO. Decimal amount serialized to string. */
export function toBudgetLineApi(l: BudgetLine) {
  return {
    id: l.id,
    budgetId: l.budgetId,
    accountId: l.accountId,
    period: l.period,
    amount: l.amount.toString(),
  };
}

export type BudgetLineWithAccount = BudgetLine & { account: Account };

export function toBudgetLineWithAccountApi(l: BudgetLineWithAccount) {
  return {
    ...toBudgetLineApi(l),
    account: { id: l.account.id, code: l.account.code, name: l.account.name, type: l.account.type },
  };
}
