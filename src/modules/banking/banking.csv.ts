import { Prisma } from '../../infrastructure/prisma';
import { BadRequestError } from '../../common/errors';

/** One parsed CSV row, pre-Decimal-conversion validation done. */
export interface ParsedBankCsvRow {
  date: Date;
  description: string;
  reference: string | null;
  amount: Prisma.Decimal; // signed: + credit / - debit
  type: 'credit' | 'debit';
}

const REQUIRED_HEADERS = ['date', 'description', 'amount'] as const;

/**
 * Minimal RFC4180-ish CSV line splitter: handles quoted fields with embedded
 * commas/escaped quotes ("") but not embedded newlines within a field (bank
 * export CSVs are one transaction per line in practice).
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse bank-statement CSV text into rows ready for BankTransaction creation.
 * Expected header (case-insensitive, any order): date, description, amount,
 * reference (optional), type (optional: credit|debit — inferred from amount
 * sign when omitted).
 *
 * Throws BadRequestError with row-level detail on malformed input.
 */
export function parseBankTransactionsCsv(csv: string): ParsedBankCsvRow[] {
  const lines = csv
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new BadRequestError('CSV is empty');
  }

  const headerCells = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headerCells.includes(h));
  if (missing.length > 0) {
    throw new BadRequestError('CSV is missing required columns', { missing });
  }

  const idx = {
    date: headerCells.indexOf('date'),
    description: headerCells.indexOf('description'),
    amount: headerCells.indexOf('amount'),
    reference: headerCells.indexOf('reference'),
    type: headerCells.indexOf('type'),
  };

  const rows: ParsedBankCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]!);

    const rawDate = cells[idx.date]?.trim();
    const rawDescription = cells[idx.description]?.trim();
    const rawAmount = cells[idx.amount]?.trim();
    const rawReference = idx.reference >= 0 ? cells[idx.reference]?.trim() || null : null;
    const rawType = idx.type >= 0 ? cells[idx.type]?.trim().toLowerCase() : undefined;

    if (!rawDate || !rawDescription || !rawAmount) {
      errors.push({ line: lineNo, message: 'Missing required field(s)' });
      continue;
    }

    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
      errors.push({ line: lineNo, message: `Invalid date "${rawDate}"` });
      continue;
    }

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(rawAmount.replace(/,/g, ''));
    } catch {
      errors.push({ line: lineNo, message: `Invalid amount "${rawAmount}"` });
      continue;
    }

    let type: 'credit' | 'debit';
    if (rawType === 'credit' || rawType === 'debit') {
      type = rawType;
    } else if (amount.gte(0)) {
      type = 'credit';
    } else {
      type = 'debit';
    }

    rows.push({ date, description: rawDescription, reference: rawReference, amount, type });
  }

  if (errors.length > 0) {
    throw new BadRequestError('CSV contains invalid rows', { errors });
  }

  return rows;
}
