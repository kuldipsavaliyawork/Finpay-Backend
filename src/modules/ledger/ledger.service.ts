import { Prisma, prisma } from '../../infrastructure/prisma';
import { UnprocessableError, NotFoundError } from '../../common/errors';

const ZERO = new Prisma.Decimal(0);

export interface JournalLineInput {
  accountId: string;
  debit?: Prisma.Decimal | number | string;
  credit?: Prisma.Decimal | number | string;
  description?: string;
}

export interface PostJournalInput {
  tenantId: string;
  date: Date;
  memo: string;
  source?: string; // manual | invoice | bill | payment | expense | ...
  sourceId?: string | null;
  createdBy?: string | null;
  lines: JournalLineInput[];
}

function dec(v: Prisma.Decimal | number | string | undefined): Prisma.Decimal {
  if (v === undefined) return ZERO;
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

/**
 * Reserve the next journal number for a tenant, atomically incrementing the
 * per-tenant counter in TenantSettings. Must run inside the caller's transaction
 * so concurrent posts can't collide on the unique (tenantId, number) index.
 */
async function nextJournalNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const settings = await tx.tenantSettings.update({
    where: { tenantId },
    data: { journalNextNumber: { increment: 1 } },
    select: { journalPrefix: true, journalNextNumber: true },
  });
  const seq = settings.journalNextNumber - 1; // value before increment
  return `${settings.journalPrefix}${String(seq).padStart(6, '0')}`;
}

export const ledgerService = {
  /**
   * Create and POST a balanced journal entry. Enforces Sum(debit) === Sum(credit)
   * and at least two lines. Runs in a transaction (its own, or the provided one)
   * so numbering + lines are atomic. Returns the created entry id.
   */
  async postJournalEntry(
    input: PostJournalInput,
    existingTx?: Prisma.TransactionClient,
  ): Promise<string> {
    if (input.lines.length < 2) {
      throw new UnprocessableError('A journal entry needs at least two lines');
    }

    const lines = input.lines.map((l) => ({
      tenantId: input.tenantId,
      accountId: l.accountId,
      debit: dec(l.debit),
      credit: dec(l.credit),
      description: l.description ?? input.memo,
    }));

    const totalDebit = lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.debit), ZERO);
    const totalCredit = lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.credit), ZERO);
    if (!totalDebit.eq(totalCredit)) {
      throw new UnprocessableError('Journal entry is not balanced', {
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
      });
    }
    if (totalDebit.eq(ZERO)) {
      throw new UnprocessableError('Journal entry total cannot be zero');
    }

    const run = async (tx: Prisma.TransactionClient): Promise<string> => {
      const number = await nextJournalNumber(tx, input.tenantId);
      const entry = await tx.journalEntry.create({
        data: {
          tenantId: input.tenantId,
          number,
          date: input.date,
          memo: input.memo,
          status: 'posted',
          source: input.source ?? 'manual',
          sourceId: input.sourceId ?? null,
          postedAt: new Date(),
          postedBy: input.createdBy ?? null,
          createdBy: input.createdBy ?? null,
          lines: { createMany: { data: lines } },
        },
      });
      return entry.id;
    };

    if (existingTx) return run(existingTx);
    return prisma.$transaction(run);
  },

  /** Look up an account by code within a tenant (used to resolve system accounts). */
  async accountByCode(tenantId: string, code: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? prisma;
    const acct = await db.account.findFirst({ where: { tenantId, code, deletedAt: null }, select: { id: true } });
    if (!acct) throw new NotFoundError(`Account ${code} not found for tenant`);
    return acct.id;
  },

  /** Resolve several system accounts by code at once → { code: id }. */
  async accountsByCode(
    tenantId: string,
    codes: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Record<string, string>> {
    const db = tx ?? prisma;
    const accts = await db.account.findMany({
      where: { tenantId, code: { in: codes }, deletedAt: null },
      select: { id: true, code: true },
    });
    const map: Record<string, string> = {};
    for (const a of accts) map[a.code] = a.id;
    for (const c of codes) {
      if (!map[c]) throw new NotFoundError(`Account ${c} not found for tenant`);
    }
    return map;
  },
};
