import { Prisma, prisma } from '../../infrastructure/prisma';
import { reportsService } from '../reports/reports.service';

const ZERO = new Prisma.Decimal(0);

function decSum(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((s, v) => s.plus(v ?? ZERO), ZERO);
}

/** First day of the calendar month `monthsAgo` months before `now` (UTC-safe local). */
function startOfMonthMonthsAgo(monthsAgo: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export const dashboardService = {
  /**
   * Dashboard summary — headline finance KPIs plus widget payloads (trend,
   * cash by account, expense mix, overdue invoices, pending approvals).
   */
  async summary(tenantId: string) {
    const now = new Date();
    const trendStart = startOfMonthMonthsAgo(5, now);

    const [
      arAgg,
      apAgg,
      overdueAgg,
      openInvoiceCount,
      openBillCount,
      bankAccounts,
      pendingApprovalCount,
      unreadNotifications,
      pnl,
      trendPayments,
      overdueInvoiceRows,
      pendingApprovalRows,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, deletedAt: null, status: { notIn: ['paid', 'cancelled', 'draft'] } },
        _sum: { balanceDue: true },
      }),
      prisma.bill.aggregate({
        where: { tenantId, deletedAt: null, status: { notIn: ['paid', 'cancelled', 'draft'] } },
        _sum: { balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where: { tenantId, deletedAt: null, status: 'overdue' },
        _sum: { balanceDue: true },
        _count: true,
      }),
      prisma.invoice.count({
        where: { tenantId, deletedAt: null, status: { notIn: ['paid', 'cancelled', 'draft'] } },
      }),
      prisma.bill.count({
        where: { tenantId, deletedAt: null, status: { notIn: ['paid', 'cancelled', 'draft'] } },
      }),
      prisma.bankAccount.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, type: true, currency: true, currentBalance: true },
        orderBy: { name: 'asc' },
      }),
      prisma.approvalRequest.count({ where: { tenantId, status: 'pending' } }),
      prisma.notification.count({ where: { tenantId, readAt: null } }),
      reportsService.profitAndLoss(tenantId, {}),
      prisma.payment.findMany({
        where: { tenantId, date: { gte: trendStart }, status: 'completed' },
        select: { direction: true, amount: true, date: true },
      }),
      prisma.invoice.findMany({
        where: { tenantId, deletedAt: null, status: 'overdue' },
        orderBy: { dueDate: 'asc' },
        take: 5,
        select: {
          id: true,
          number: true,
          dueDate: true,
          balanceDue: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.approvalRequest.findMany({
        where: { tenantId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: {
          id: true,
          entityType: true,
          currentLevel: true,
          createdAt: true,
        },
      }),
    ]);

    const cashPosition = decSum(bankAccounts.map((b) => b.currentBalance));

    // ── Monthly income vs expense (last 6 calendar months) ──────────────────
    const months: Array<{ key: string; label: string; income: number; expense: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonthMonthsAgo(i, now);
      months.push({ key: monthKey(d), label: monthLabel(d), income: 0, expense: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const p of trendPayments) {
      const bucket = byKey.get(monthKey(p.date));
      if (!bucket) continue;
      const amt = Number(p.amount);
      if (p.direction === 'inbound') bucket.income += amt;
      else if (p.direction === 'outbound') bucket.expense += amt;
    }
    const monthlyTrend = months.map((m) => ({
      label: m.label,
      income: m.income.toFixed(4),
      expense: m.expense.toFixed(4),
    }));

    // ── Expense mix (top 5 P&L expense accounts + Other) ────────────────────
    const expenseAccounts = [...pnl.expenses.accounts]
      .map((a) => ({ name: a.name, amount: Number(a.amount) }))
      .filter((a) => a.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const top = expenseAccounts.slice(0, 5);
    const otherSum = expenseAccounts.slice(5).reduce((s, a) => s + a.amount, 0);
    const expenseMix = [
      ...top.map((a) => ({ name: a.name, amount: a.amount.toFixed(4) })),
      ...(otherSum > 0 ? [{ name: 'Other', amount: otherSum.toFixed(4) }] : []),
    ];

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });

    return {
      currency: tenant?.baseCurrency ?? 'INR',
      accountsReceivable: (arAgg._sum.balanceDue ?? ZERO).toFixed(4),
      accountsPayable: (apAgg._sum.balanceDue ?? ZERO).toFixed(4),
      cashPosition: cashPosition.toFixed(4),
      overdue: {
        amount: (overdueAgg._sum.balanceDue ?? ZERO).toFixed(4),
        count: overdueAgg._count,
      },
      revenue: pnl.income.total,
      expenses: pnl.expenses.total,
      netProfit: pnl.netProfit,
      counts: {
        openInvoices: openInvoiceCount,
        openBills: openBillCount,
        pendingApprovals: pendingApprovalCount,
        unreadNotifications,
      },
      monthlyTrend,
      cashByAccount: bankAccounts.map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type,
        currency: b.currency,
        currentBalance: b.currentBalance.toFixed(4),
      })),
      expenseMix,
      overdueInvoices: overdueInvoiceRows.map((inv) => ({
        id: inv.id,
        number: inv.number,
        customerName: inv.customer.name,
        dueDate: inv.dueDate.toISOString(),
        balanceDue: inv.balanceDue.toFixed(4),
      })),
      pendingApprovals: pendingApprovalRows.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        currentLevel: a.currentLevel,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  },

  /**
   * Recent activity feed — latest posted journal entries and payments, for the
   * dashboard timeline.
   */
  async recentActivity(tenantId: string, limit = 10) {
    const [payments, journals] = await Promise.all([
      prisma.payment.findMany({
        where: { tenantId },
        orderBy: { date: 'desc' },
        take: limit,
        select: { id: true, number: true, direction: true, amount: true, date: true, method: true },
      }),
      prisma.journalEntry.findMany({
        where: { tenantId, status: 'posted' },
        orderBy: { date: 'desc' },
        take: limit,
        select: { id: true, number: true, memo: true, source: true, date: true },
      }),
    ]);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        number: p.number,
        direction: p.direction,
        amount: p.amount.toFixed(4),
        date: p.date.toISOString(),
        method: p.method,
      })),
      journals: journals.map((j) => ({
        id: j.id,
        number: j.number,
        memo: j.memo,
        source: j.source,
        date: j.date.toISOString(),
      })),
    };
  },
};
