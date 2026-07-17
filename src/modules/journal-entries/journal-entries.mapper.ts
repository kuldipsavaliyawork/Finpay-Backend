import type { JournalLine } from '@prisma/client';
import { Prisma } from '../../infrastructure/prisma';
import type { JournalEntryWithLines } from './journal-entries.repository';

const ZERO = new Prisma.Decimal(0);

function lineApi(l: JournalLine & { account: { id: string; code: string; name: string } }) {
  return {
    id: l.id,
    accountId: l.accountId,
    accountCode: l.account.code,
    accountName: l.account.name,
    debit: l.debit.toString(),
    credit: l.credit.toString(),
    description: l.description,
  };
}

/** JournalEntry entity -> API DTO. All Decimal money fields serialized to strings. */
export function toJournalEntryApi(e: JournalEntryWithLines) {
  const totalDebit = e.lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.debit), ZERO);
  const totalCredit = e.lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.credit), ZERO);
  return {
    id: e.id,
    number: e.number,
    date: e.date.toISOString(),
    memo: e.memo,
    status: e.status,
    source: e.source,
    sourceId: e.sourceId,
    isRecurring: e.isRecurring,
    recurrenceId: e.recurrenceId,
    reversalOfId: e.reversalOfId,
    postedAt: e.postedAt ? e.postedAt.toISOString() : null,
    postedBy: e.postedBy,
    createdBy: e.createdBy,
    lines: e.lines.map(lineApi),
    totalDebit: totalDebit.toString(),
    totalCredit: totalCredit.toString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Compact list-row shape (used when full line detail isn't needed). */
export function toJournalEntryListApi(e: JournalEntryWithLines) {
  const { lines, ...rest } = toJournalEntryApi(e);
  void lines;
  return rest;
}

export type JournalEntryApi = ReturnType<typeof toJournalEntryApi>;
