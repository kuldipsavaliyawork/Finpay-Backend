import { Prisma, type PrismaClient, type JournalEntry, type JournalLine } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type JournalEntryWithLines = JournalEntry & {
  lines: (JournalLine & { account: { id: string; code: string; name: string } })[];
};

export interface ListJournalEntryArgs {
  skip: number;
  take: number;
  q?: string;
  status?: string;
  source?: string;
  accountId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'number' | 'date' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}

function journalEntryWhere(
  tenantId: string,
  a: { q?: string; status?: string; source?: string; accountId?: string; dateFrom?: Date; dateTo?: Date },
): Prisma.JournalEntryWhereInput {
  const where: Prisma.JournalEntryWhereInput = { tenantId };
  if (a.status) where.status = a.status;
  if (a.source) where.source = a.source;
  if (a.accountId) where.lines = { some: { accountId: a.accountId } };
  if (a.dateFrom || a.dateTo) {
    where.date = {
      ...(a.dateFrom ? { gte: a.dateFrom } : {}),
      ...(a.dateTo ? { lte: a.dateTo } : {}),
    };
  }
  if (a.q) {
    where.OR = [
      { number: { contains: a.q, mode: 'insensitive' } },
      { memo: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

const withLines = {
  lines: { include: { account: { select: { id: true, code: true, name: true } } } },
} as const;

/**
 * Journal entries repository — all Prisma access for the journal-entries
 * module, ALWAYS tenant-scoped. Reuses the `journal_entries` / `journal_lines`
 * tables owned by ledger.service; this module only adds read/draft/reverse
 * API-layer access on top (posting itself stays in ledgerService).
 */
export const journalEntriesRepository = {
  list(tenantId: string, a: ListJournalEntryArgs, db: Db = prisma): Promise<JournalEntryWithLines[]> {
    return db.journalEntry.findMany({
      where: journalEntryWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'date']: a.sortDir ?? 'desc' },
      include: withLines,
    });
  },

  count(
    tenantId: string,
    a: { q?: string; status?: string; source?: string; accountId?: string; dateFrom?: Date; dateTo?: Date },
    db: Db = prisma,
  ): Promise<number> {
    return db.journalEntry.count({ where: journalEntryWhere(tenantId, a) });
  },

  findById(tenantId: string, id: string, db: Db = prisma): Promise<JournalEntryWithLines | null> {
    return db.journalEntry.findFirst({ where: { id, tenantId }, include: withLines });
  },

  findByIdForUpdate(tenantId: string, id: string, db: Db = prisma): Promise<JournalEntry | null> {
    return db.journalEntry.findFirst({ where: { id, tenantId } });
  },

  createDraft(
    tenantId: string,
    data: {
      number: string;
      date: Date;
      memo: string | null;
      source: string;
      sourceId: string | null;
      createdBy: string | null;
      lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; description: string | null }[];
    },
    db: Db = prisma,
  ): Promise<JournalEntry> {
    return db.journalEntry.create({
      data: {
        tenantId,
        number: data.number,
        date: data.date,
        memo: data.memo,
        status: 'draft',
        source: data.source,
        sourceId: data.sourceId,
        createdBy: data.createdBy,
        lines: { createMany: { data: data.lines.map((l) => ({ ...l, tenantId })) } },
      },
    });
  },

  replaceDraftLines(
    tenantId: string,
    id: string,
    data: Prisma.JournalEntryUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.journalEntry.updateMany({ where: { id, tenantId, status: 'draft' }, data });
  },

  deleteLines(tenantId: string, entryId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.journalLine.deleteMany({ where: { entryId, tenantId } });
  },

  createLines(
    tenantId: string,
    entryId: string,
    lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; description: string | null }[],
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.journalLine.createMany({
      data: lines.map((l) => ({ ...l, tenantId, entryId })),
    });
  },

  markStatus(
    tenantId: string,
    id: string,
    data: Prisma.JournalEntryUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.journalEntry.updateMany({ where: { id, tenantId }, data });
  },

  softDeleteDraft(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    // Journal entries have no deletedAt column; drafts are hard-deleted (lines cascade).
    return db.journalEntry.deleteMany({ where: { id, tenantId, status: 'draft' } });
  },

  /** Reserve the next journal number for a tenant (same counter ledger.service uses). */
  async nextNumber(tenantId: string, db: Db = prisma): Promise<string> {
    const settings = await (db as PrismaClient).tenantSettings.update({
      where: { tenantId },
      data: { journalNextNumber: { increment: 1 } },
      select: { journalPrefix: true, journalNextNumber: true },
    });
    const seq = settings.journalNextNumber - 1;
    return `${settings.journalPrefix}${String(seq).padStart(6, '0')}`;
  },

  /** Paginated GL history for one account, drawn from posted journal lines. */
  accountHistory(
    tenantId: string,
    accountId: string,
    a: { skip: number; take: number; dateFrom?: Date; dateTo?: Date },
    db: Db = prisma,
  ) {
    const where: Prisma.JournalLineWhereInput = {
      tenantId,
      accountId,
      entry: {
        status: 'posted',
        ...(a.dateFrom || a.dateTo
          ? { date: { ...(a.dateFrom ? { gte: a.dateFrom } : {}), ...(a.dateTo ? { lte: a.dateTo } : {}) } }
          : {}),
      },
    };
    return Promise.all([
      db.journalLine.findMany({
        where,
        skip: a.skip,
        take: a.take,
        orderBy: { entry: { date: 'desc' } },
        include: { entry: { select: { id: true, number: true, date: true, memo: true, source: true, status: true } } },
      }),
      db.journalLine.count({ where }),
    ]);
  },
};
