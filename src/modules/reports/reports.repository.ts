import { Prisma, type Account } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

export interface AccountBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

/**
 * Reports repository — read-only, always tenant-scoped access to the ledger.
 * Aggregates posted journal lines per account. Balances are computed from
 * immutable JournalLine rows so every report is derived from the same
 * double-entry source of truth as the dashboard.
 */
export const reportsRepository = {
  listAccounts(tenantId: string): Promise<Account[]> {
    return prisma.account.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  },

  /**
   * Sum debit/credit per account across POSTED journal entries, optionally up to
   * an `asOf` date (inclusive). Returns one row per account that has activity.
   */
  async accountBalances(tenantId: string, asOf?: Date): Promise<Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>> {
    const dateFilter = asOf ? Prisma.sql`AND je."date" <= ${asOf}` : Prisma.empty;
    const rows = await prisma.$queryRaw<
      Array<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT jl."accountId"      AS "accountId",
             COALESCE(SUM(jl.debit), 0)  AS "debit",
             COALESCE(SUM(jl.credit), 0) AS "credit"
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl."entryId"
      WHERE jl."tenantId" = ${tenantId}::uuid
        AND je.status = 'posted'
        ${dateFilter}
      GROUP BY jl."accountId"
    `);
    const map = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const r of rows) {
      map.set(r.accountId, {
        debit: new Prisma.Decimal(r.debit ?? 0),
        credit: new Prisma.Decimal(r.credit ?? 0),
      });
    }
    return map;
  },
};
