import { Prisma } from '../../infrastructure/prisma';
import { parseOptionalDate } from '../../common/http';
import { isDebitNature } from '../../common/accounting/account-nature';
import { reportsRepository as repo } from './reports.repository';

const ZERO = new Prisma.Decimal(0);

export const reportsService = {
  /**
   * Trial balance — one row per account with a non-zero net movement, showing
   * the balance in its natural column. Sum(debit) MUST equal Sum(credit); the
   * response carries a `balanced` flag and the two totals for verification.
   */
  async trialBalance(tenantId: string, filters: { asOf?: string }) {
    const asOf = parseOptionalDate(filters.asOf);
    const [accounts, balances] = await Promise.all([
      repo.listAccounts(tenantId),
      repo.accountBalances(tenantId, asOf),
    ]);

    let totalDebit = ZERO;
    let totalCredit = ZERO;

    const rows = accounts
      .map((a) => {
        const b = balances.get(a.id) ?? { debit: ZERO, credit: ZERO };
        // Net movement, presented in the account's natural column.
        const net = b.debit.minus(b.credit);
        let debit = ZERO;
        let credit = ZERO;
        if (isDebitNature(a.type)) {
          if (net.gte(0)) debit = net;
          else credit = net.abs();
        } else {
          if (net.lte(0)) credit = net.abs();
          else debit = net;
        }
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          debit,
          credit,
        };
      })
      .filter((r) => !r.debit.eq(ZERO) || !r.credit.eq(ZERO));

    for (const r of rows) {
      totalDebit = totalDebit.plus(r.debit);
      totalCredit = totalCredit.plus(r.credit);
    }

    return {
      asOf: (asOf ?? new Date()).toISOString(),
      rows: rows.map((r) => ({
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        type: r.type,
        subtype: r.subtype,
        debit: r.debit.toFixed(4),
        credit: r.credit.toFixed(4),
      })),
      totals: {
        debit: totalDebit.toFixed(4),
        credit: totalCredit.toFixed(4),
      },
      balanced: totalDebit.eq(totalCredit),
    };
  },

  /**
   * Balance sheet — assets = liabilities + equity, as of a date. Income/expense
   * net result is folded into equity as current-period earnings.
   */
  async balanceSheet(tenantId: string, filters: { asOf?: string }) {
    const asOf = parseOptionalDate(filters.asOf);
    const [accounts, balances] = await Promise.all([
      repo.listAccounts(tenantId),
      repo.accountBalances(tenantId, asOf),
    ]);

    const groups: Record<'asset' | 'liability' | 'equity', { accountId: string; code: string; name: string; balance: string }[]> = {
      asset: [],
      liability: [],
      equity: [],
    };
    let assetsTotal = ZERO;
    let liabilitiesTotal = ZERO;
    let equityTotal = ZERO;
    let incomeNet = ZERO; // credit-positive
    let expenseNet = ZERO; // debit-positive

    for (const a of accounts) {
      const b = balances.get(a.id) ?? { debit: ZERO, credit: ZERO };
      const net = b.debit.minus(b.credit);
      if (a.type === 'asset') {
        assetsTotal = assetsTotal.plus(net);
        groups.asset.push({ accountId: a.id, code: a.code, name: a.name, balance: net.toFixed(4) });
      } else if (a.type === 'liability') {
        const bal = net.negated();
        liabilitiesTotal = liabilitiesTotal.plus(bal);
        groups.liability.push({ accountId: a.id, code: a.code, name: a.name, balance: bal.toFixed(4) });
      } else if (a.type === 'equity') {
        const bal = net.negated();
        equityTotal = equityTotal.plus(bal);
        groups.equity.push({ accountId: a.id, code: a.code, name: a.name, balance: bal.toFixed(4) });
      } else if (a.type === 'income') {
        incomeNet = incomeNet.plus(net.negated());
      } else if (a.type === 'expense') {
        expenseNet = expenseNet.plus(net);
      }
    }

    const currentEarnings = incomeNet.minus(expenseNet);
    equityTotal = equityTotal.plus(currentEarnings);
    groups.equity.push({
      accountId: 'current-earnings',
      code: '3900',
      name: 'Current Period Earnings',
      balance: currentEarnings.toFixed(4),
    });

    return {
      asOf: (asOf ?? new Date()).toISOString(),
      assets: { accounts: groups.asset, total: assetsTotal.toFixed(4) },
      liabilities: { accounts: groups.liability, total: liabilitiesTotal.toFixed(4) },
      equity: { accounts: groups.equity, total: equityTotal.toFixed(4) },
      balanced: assetsTotal.eq(liabilitiesTotal.plus(equityTotal)),
    };
  },

  /**
   * Profit & loss — income and expense totals with net profit, over the period
   * ending at `asOf` (open-to-date). Kept simple: all posted income/expense.
   */
  async profitAndLoss(tenantId: string, filters: { asOf?: string }) {
    const asOf = parseOptionalDate(filters.asOf);
    const [accounts, balances] = await Promise.all([
      repo.listAccounts(tenantId),
      repo.accountBalances(tenantId, asOf),
    ]);

    const income: { accountId: string; code: string; name: string; amount: string }[] = [];
    const expenses: { accountId: string; code: string; name: string; amount: string }[] = [];
    let incomeTotal = ZERO;
    let expenseTotal = ZERO;

    for (const a of accounts) {
      const b = balances.get(a.id) ?? { debit: ZERO, credit: ZERO };
      const net = b.debit.minus(b.credit);
      if (a.type === 'income') {
        const amount = net.negated();
        incomeTotal = incomeTotal.plus(amount);
        if (!amount.eq(ZERO)) income.push({ accountId: a.id, code: a.code, name: a.name, amount: amount.toFixed(4) });
      } else if (a.type === 'expense') {
        expenseTotal = expenseTotal.plus(net);
        if (!net.eq(ZERO)) expenses.push({ accountId: a.id, code: a.code, name: a.name, amount: net.toFixed(4) });
      }
    }

    return {
      asOf: (asOf ?? new Date()).toISOString(),
      income: { accounts: income, total: incomeTotal.toFixed(4) },
      expenses: { accounts: expenses, total: expenseTotal.toFixed(4) },
      netProfit: incomeTotal.minus(expenseTotal).toFixed(4),
    };
  },
};
