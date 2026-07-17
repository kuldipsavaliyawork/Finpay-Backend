import { config } from '../../config/config';
import { ROLE_KEYS } from '../../config/constants';
import { prisma } from '../../infrastructure/prisma';
import { dashboardService } from '../dashboard/dashboard.service';

const DEMO_TENANT_SLUG = 'valoris-fusion';

const ROLE_UI: Record<string, { color: string; icon: string }> = {
  [ROLE_KEYS.OWNER]: { color: '#f46a6a', icon: 'bi-shield-fill-check' },
  [ROLE_KEYS.ADMIN]: { color: '#ec4899', icon: 'bi-gear-fill' },
  [ROLE_KEYS.ACCOUNTANT]: { color: '#34c38f', icon: 'bi-calculator-fill' },
  [ROLE_KEYS.APPROVER]: { color: '#f59e0b', icon: 'bi-check2-square' },
  [ROLE_KEYS.VIEWER]: { color: '#20b757', icon: 'bi-eye-fill' },
};

async function resolveDemoTenantId(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: DEMO_TENANT_SLUG, status: 'active' },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

export const publicService = {
  /**
   * Login-page showcase KPIs — aggregated from the demo tenant database.
   * No authentication required; returns null fields when demo tenant is absent.
   */
  async showcase() {
    const tenantId = await resolveDemoTenantId();
    if (!tenantId) {
      return {
        tenantName: null,
        currency: 'INR',
        cashPosition: '0',
        cashChangePercent: 0,
        netProfit: '0',
        overdue: { amount: '0', count: 0 },
        openInvoices: 0,
      };
    }

    const [summary, tenant] = await Promise.all([
      dashboardService.summary(tenantId),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, baseCurrency: true },
      }),
    ]);

    const trend = summary.monthlyTrend;
    let cashChangePercent = 0;
    if (trend.length >= 2) {
      const prev = Number(trend[trend.length - 2]!.income) || 0;
      const curr = Number(trend[trend.length - 1]!.income) || 0;
      if (prev > 0) cashChangePercent = Math.round(((curr - prev) / prev) * 1000) / 10;
    }

    return {
      tenantName: tenant?.name ?? null,
      currency: tenant?.baseCurrency ?? 'INR',
      cashPosition: summary.cashPosition,
      cashChangePercent,
      netProfit: summary.netProfit,
      overdue: summary.overdue,
      openInvoices: summary.counts.openInvoices,
    };
  },

  /**
   * Demo login accounts from the seeded tenant — emails and roles from DB.
   * Password hint is only included outside production (demo environments).
   */
  async demoAccounts() {
    const tenantId = await resolveDemoTenantId();
    if (!tenantId) return [];

    const memberships = await prisma.membership.findMany({
      where: { tenantId, status: 'active' },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        roles: { include: { role: { select: { key: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const passwordHint = config.isProd ? undefined : 'Password123!';

    return memberships.map((m) => {
      const role = m.roles[0]?.role;
      const roleKey = role?.key ?? 'viewer';
      const ui = ROLE_UI[roleKey] ?? { color: '#64748b', icon: 'bi-person-fill' };
      return {
        email: m.user.email,
        role: role?.name ?? 'User',
        roleKey,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        color: ui.color,
        icon: ui.icon,
        ...(passwordHint ? { passwordHint } : {}),
      };
    });
  },
};
