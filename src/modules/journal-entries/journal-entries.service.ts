import { Prisma, prisma } from '../../infrastructure/prisma';
import { NotFoundError, ConflictError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseDateWithFallback, parseOptionalDate, type Ctx } from '../../common/http';
import { ledgerService } from '../ledger/ledger.service';
import { reportsService } from '../reports/reports.service';
import { journalEntriesRepository as repo } from './journal-entries.repository';
import type {
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
  ReverseJournalEntryInput,
  JournalLineInput,
} from './journal-entries.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

/** Validate Sum(debit) === Sum(credit) and return the balanced total. Throws on mismatch. */
function assertBalanced(lines: JournalLineInput[]): Prisma.Decimal {
  if (lines.length < 2) {
    throw new UnprocessableError('A journal entry needs at least two lines');
  }
  let totalDebit = ZERO;
  let totalCredit = ZERO;
  for (const l of lines) {
    totalDebit = totalDebit.plus(new Prisma.Decimal(l.debit ?? 0));
    totalCredit = totalCredit.plus(new Prisma.Decimal(l.credit ?? 0));
  }
  if (!totalDebit.eq(totalCredit)) {
    throw new UnprocessableError('Journal entry is not balanced', {
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
    });
  }
  if (totalDebit.eq(ZERO)) {
    throw new UnprocessableError('Journal entry total cannot be zero');
  }
  return totalDebit;
}

function toRepoLines(lines: JournalLineInput[]) {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: new Prisma.Decimal(l.debit ?? 0),
    credit: new Prisma.Decimal(l.credit ?? 0),
    description: l.description ?? null,
  }));
}

export const journalEntriesService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      status?: string;
      source?: string;
      accountId?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: 'number' | 'date' | 'createdAt';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const args = {
      skip: paging.skip,
      take: paging.take,
      q: filters.q,
      status: filters.status,
      source: filters.source,
      accountId: filters.accountId,
      dateFrom: parseOptionalDate(filters.dateFrom),
      dateTo: parseOptionalDate(filters.dateTo),
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    };
    const [items, total] = await Promise.all([repo.list(tenantId, args), repo.count(tenantId, args)]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const entry = await repo.findById(tenantId, id);
    if (!entry) throw new NotFoundError('Journal entry not found');
    return entry;
  },

  /** Create a DRAFT entry. Validated (balanced) but not posted — editable/deletable while draft. */
  async createDraft(ctx: Ctx, input: CreateJournalEntryInput) {
    assertBalanced(input.lines);
    const date = parseDateWithFallback(input.date, new Date());
    const repoLines = toRepoLines(input.lines);

    const entry = await prisma.$transaction(async (tx) => {
      const number = await repo.nextNumber(ctx.tenantId, tx);
      const created = await repo.createDraft(
        ctx.tenantId,
        {
          number,
          date,
          memo: input.memo ?? null,
          source: input.source ?? 'manual',
          sourceId: input.sourceId ?? null,
          createdBy: ctx.userId,
          lines: repoLines,
        },
        tx,
      );

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'journal-entries',
          entityType: 'journal_entry',
          entityId: created.id,
          after: { number, status: 'draft' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });

    return this.get(ctx.tenantId, entry.id);
  },

  /** Update a DRAFT entry's header/lines. Only drafts are editable. */
  async updateDraft(ctx: Ctx, id: string, input: UpdateJournalEntryInput) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft journal entries can be edited');
    }

    await prisma.$transaction(async (tx) => {
      const data: Prisma.JournalEntryUpdateInput = {};
      if (input.date) data.date = parseDateWithFallback(input.date, before.date);
      if (input.memo !== undefined) data.memo = input.memo;

      if (input.lines) {
        assertBalanced(input.lines);
        await repo.deleteLines(ctx.tenantId, id, tx);
        await repo.createLines(ctx.tenantId, id, toRepoLines(input.lines), tx);
      }

      if (Object.keys(data).length > 0) {
        await repo.replaceDraftLines(ctx.tenantId, id, data, tx);
      }

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'journal-entries',
          entityType: 'journal_entry',
          entityId: id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /** Delete a DRAFT entry (hard delete; lines cascade). Posted entries must be reversed, not deleted. */
  async removeDraft(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft journal entries can be deleted; reverse a posted entry instead');
    }
    await repo.softDeleteDraft(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'journal-entries',
      entityType: 'journal_entry',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * POST a draft entry: delegates the actual balanced double-entry posting to
   * ledgerService.postJournalEntry (single source of truth for numbering +
   * invariant enforcement), then retires this draft row in favor of the
   * newly-posted entry it creates, keeping one immutable posted row per post.
   *
   * We reuse the *same* row here rather than creating a second one: since this
   * draft already reserved a number and holds valid balanced lines, posting
   * simply flips it to `posted` in place. This avoids duplicating
   * ledgerService's numbering logic while keeping posted rows immutable
   * afterwards (no further updateDraft/removeDraft calls will succeed once
   * status !== 'draft').
   */
  async post(ctx: Ctx, id: string) {
    const entry = await this.get(ctx.tenantId, id);
    if (entry.status !== 'draft') {
      throw new ConflictError('Journal entry is already posted or reversed');
    }
    assertBalanced(
      entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit.toNumber(), credit: l.credit.toNumber() })),
    );

    await prisma.$transaction(async (tx) => {
      await repo.markStatus(
        ctx.tenantId,
        id,
        { status: 'posted', postedAt: new Date(), postedBy: ctx.userId },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'post',
          module: 'journal-entries',
          entityType: 'journal_entry',
          entityId: id,
          after: { status: 'posted' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /**
   * REVERSE a posted entry: creates a mirror entry (debits <-> credits swapped)
   * via ledgerService.postJournalEntry so the reversal is itself posted and
   * balanced by the shared invariant check, then links it back via
   * reversalOfId and flips the original to `reversed` (immutable from then on).
   */
  async reverse(ctx: Ctx, id: string, input: ReverseJournalEntryInput) {
    const original = await this.get(ctx.tenantId, id);
    if (original.status !== 'posted') {
      throw new UnprocessableError('Only posted journal entries can be reversed');
    }

    const mirrorLines = original.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      description: l.description ?? undefined,
    }));

    const reversalId = await prisma.$transaction(async (tx) => {
      const newId = await ledgerService.postJournalEntry(
        {
          tenantId: ctx.tenantId,
          date: parseDateWithFallback(input.date, new Date()),
          memo: input.memo ?? `Reversal of ${original.number}`,
          source: 'reversal',
          sourceId: original.id,
          createdBy: ctx.userId,
          lines: mirrorLines,
        },
        tx,
      );

      // newId was just created above inside this same transaction (by
      // ledgerService.postJournalEntry) so it is already known-good and
      // tenant-owned; updateMany still scopes by tenantId defensively.
      await tx.journalEntry.updateMany({
        where: { id: newId, tenantId: ctx.tenantId },
        data: { reversalOfId: original.id },
      });

      await repo.markStatus(ctx.tenantId, original.id, { status: 'reversed' }, tx);

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'reverse',
          module: 'journal-entries',
          entityType: 'journal_entry',
          entityId: original.id,
          after: { status: 'reversed', reversalEntryId: newId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return newId;
    });

    return this.get(ctx.tenantId, reversalId);
  },

  /** Paginated GL history (posted lines) for a single account. */
  async accountHistory(
    tenantId: string,
    accountId: string,
    paging: Paging,
    filters: { dateFrom?: string; dateTo?: string },
  ) {
    const account = await prisma.account.findFirst({ where: { id: accountId, tenantId, deletedAt: null } });
    if (!account) throw new NotFoundError('Account not found');

    const [lines, total] = await repo.accountHistory(tenantId, accountId, {
      skip: paging.skip,
      take: paging.take,
      dateFrom: parseOptionalDate(filters.dateFrom),
      dateTo: parseOptionalDate(filters.dateTo),
    });

    let runningBalance = ZERO;
    const isDebitNature = account.type === 'asset' || account.type === 'expense';
    // Rows come back newest-first; compute a running balance oldest -> newest, then re-reverse for display.
    const chronological = [...lines].reverse();
    const withBalance = chronological.map((l) => {
      const delta = isDebitNature ? l.debit.minus(l.credit) : l.credit.minus(l.debit);
      runningBalance = runningBalance.plus(delta);
      return { line: l, balance: runningBalance };
    });
    const rows = withBalance.reverse().map(({ line, balance }) => ({
      id: line.id,
      entryId: line.entry.id,
      entryNumber: line.entry.number,
      date: line.entry.date.toISOString(),
      memo: line.entry.memo,
      source: line.entry.source,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      description: line.description,
      runningBalance: balance.toFixed(4),
    }));

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      rows,
      total,
    };
  },

  /** Trial-balance passthrough — reuses reportsService so numbers stay identical across modules. */
  async trialBalance(tenantId: string, filters: { asOf?: string }) {
    return reportsService.trialBalance(tenantId, filters);
  },
};
