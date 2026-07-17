import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { requireDate, type Ctx } from '../../common/http';
import { bankingRepository as repo } from './banking.repository';
import { parseBankTransactionsCsv } from './banking.csv';
import type {
  CreateBankAccountInput,
  UpdateBankAccountInput,
  MatchTransactionInput,
  CreateReconciliationInput,
} from './banking.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

// ── Bank accounts ────────────────────────────────────────────────────────────

export const bankAccountsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; type?: string; sortBy?: 'name' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listBankAccounts(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countBankAccounts(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const bankAccount = await repo.findBankAccountById(tenantId, id);
    if (!bankAccount) throw new NotFoundError('Bank account not found');
    return bankAccount;
  },

  async create(ctx: Ctx, input: CreateBankAccountInput) {
    const coaAccount = await prisma.account.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!coaAccount) throw new NotFoundError('Chart-of-accounts account not found');
    if (coaAccount.type !== 'asset') {
      throw new UnprocessableError('Bank accounts must map to an asset account', { type: coaAccount.type });
    }

    const dupe = await repo.findBankAccountByCoaAccountId(ctx.tenantId, input.accountId);
    if (dupe) throw new ConflictError('This chart-of-accounts account is already mapped to a bank account');

    return prisma.$transaction(async (tx) => {
      const bankAccount = await repo.createBankAccount(
        ctx.tenantId,
        {
          accountId: input.accountId,
          name: input.name,
          bankName: input.bankName ?? null,
          accountNumber: input.accountNumber ?? null,
          type: input.type ?? 'bank',
          currency: input.currency ?? coaAccount.currency ?? 'INR',
          currentBalance: new Prisma.Decimal(input.currentBalance ?? 0),
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'banking',
          entityType: 'bank_account',
          entityId: bankAccount.id,
          after: bankAccount,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return bankAccount;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateBankAccountInput) {
    const before = await this.get(ctx.tenantId, id);

    const data: Prisma.BankAccountUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.bankName !== undefined) data.bankName = input.bankName;
    if (input.accountNumber !== undefined) data.accountNumber = input.accountNumber;
    if (input.type !== undefined) data.type = input.type;
    if (input.currency !== undefined) data.currency = input.currency;

    await repo.updateBankAccount(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'banking',
      entityType: 'bank_account',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    await repo.softDeleteBankAccount(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'banking',
      entityType: 'bank_account',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },
};

// ── Bank transactions ────────────────────────────────────────────────────────

export const bankTransactionsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      bankAccountId?: string;
      status?: string;
      type?: string;
      from?: string;
      to?: string;
      importBatchId?: string;
      sortBy?: 'date' | 'amount' | 'createdAt';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const from = filters.from ? requireDate(filters.from) : undefined;
    const to = filters.to ? requireDate(filters.to) : undefined;
    const [items, total] = await Promise.all([
      repo.listBankTransactions(tenantId, { skip: paging.skip, take: paging.take, ...filters, from, to }),
      repo.countBankTransactions(tenantId, { ...filters, from, to }),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const txn = await repo.findBankTransactionById(tenantId, id);
    if (!txn) throw new NotFoundError('Bank transaction not found');
    return txn;
  },

  /**
   * Import bank-statement CSV rows for a bank account. All rows created in
   * this call share a single importBatchId so they can be listed/filtered
   * together and (in principle) rolled back as a batch.
   */
  async importCsv(ctx: Ctx, bankAccountId: string, csv: string) {
    const bankAccount = await bankAccountsService.get(ctx.tenantId, bankAccountId);
    const rows = parseBankTransactionsCsv(csv);
    if (rows.length === 0) {
      throw new UnprocessableError('CSV contained no importable rows');
    }

    const importBatchId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await repo.createManyBankTransactions(
        ctx.tenantId,
        rows.map((r) => ({
          bankAccountId: bankAccount.id,
          date: r.date,
          description: r.description,
          reference: r.reference,
          amount: r.amount,
          type: r.type,
          status: 'unmatched',
          importBatchId,
        })),
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'import',
          module: 'banking',
          entityType: 'bank_transaction',
          entityId: importBatchId,
          after: { bankAccountId: bankAccount.id, importBatchId, rowCount: rows.length },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    const [items, total] = await Promise.all([
      repo.listBankTransactions(ctx.tenantId, { skip: 0, take: rows.length, importBatchId }),
      repo.countBankTransactions(ctx.tenantId, { importBatchId }),
    ]);

    return { importBatchId, imported: total, items };
  },

  /** Match a bank transaction to an existing payment / expense / journal entry. */
  async match(ctx: Ctx, id: string, input: MatchTransactionInput) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status === 'matched') {
      throw new ConflictError('Bank transaction is already matched');
    }

    await this.assertMatchTargetExists(ctx.tenantId, input.matchedType, input.matchedId);

    await prisma.$transaction(async (tx) => {
      await repo.updateBankTransaction(
        ctx.tenantId,
        id,
        { status: 'matched', matchedType: input.matchedType, matchedId: input.matchedId },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'match',
          module: 'banking',
          entityType: 'bank_transaction',
          entityId: id,
          before: { status: before.status },
          after: { status: 'matched', matchedType: input.matchedType, matchedId: input.matchedId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /** Unmatch a previously matched bank transaction, returning it to `unmatched`. */
  async unmatch(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'matched') {
      throw new UnprocessableError('Only matched transactions can be unmatched');
    }

    await prisma.$transaction(async (tx) => {
      await repo.updateBankTransaction(
        ctx.tenantId,
        id,
        { status: 'unmatched', matchedType: null, matchedId: null },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'unmatch',
          module: 'banking',
          entityType: 'bank_transaction',
          entityId: id,
          before: { status: before.status, matchedType: before.matchedType, matchedId: before.matchedId },
          after: { status: 'unmatched' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /** Verify the referenced payment/expense/journal entry exists for this tenant. */
  async assertMatchTargetExists(tenantId: string, matchedType: 'payment' | 'expense' | 'journal', matchedId: string) {
    let exists = false;
    if (matchedType === 'payment') {
      exists = !!(await prisma.payment.findFirst({ where: { id: matchedId, tenantId } }));
    } else if (matchedType === 'expense') {
      exists = !!(await prisma.expense.findFirst({ where: { id: matchedId, tenantId, deletedAt: null } }));
    } else {
      exists = !!(await prisma.journalEntry.findFirst({ where: { id: matchedId, tenantId } }));
    }
    if (!exists) {
      throw new NotFoundError(`${matchedType} not found`, { matchedType, matchedId });
    }
  },
};

// ── Reconciliation ───────────────────────────────────────────────────────────

export const reconciliationsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { bankAccountId?: string; status?: string; sortBy?: 'statementDate' | 'createdAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listReconciliations(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countReconciliations(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const reconciliation = await repo.findReconciliationById(tenantId, id);
    if (!reconciliation) throw new NotFoundError('Reconciliation not found');
    return reconciliation;
  },

  /**
   * Start a reconciliation: snapshot the bank account's current book balance
   * against the given bank-statement balance, computing the difference.
   * Only one in_progress reconciliation is allowed per bank account at a time.
   */
  async create(ctx: Ctx, input: CreateReconciliationInput) {
    const bankAccount = await bankAccountsService.get(ctx.tenantId, input.bankAccountId);

    const open = await repo.findOpenReconciliation(ctx.tenantId, input.bankAccountId);
    if (open) {
      throw new ConflictError('A reconciliation is already in progress for this bank account', { id: open.id });
    }

    const statementDate = requireDate(input.statementDate);
    const statementBalance = new Prisma.Decimal(input.statementBalance);
    const bookBalance = bankAccount.currentBalance;
    const difference = statementBalance.minus(bookBalance);

    return prisma.$transaction(async (tx) => {
      const reconciliation = await repo.createReconciliation(
        ctx.tenantId,
        {
          bankAccountId: input.bankAccountId,
          statementDate,
          statementBalance,
          bookBalance,
          difference,
          status: 'in_progress',
          createdBy: ctx.userId,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'banking',
          entityType: 'reconciliation',
          entityId: reconciliation.id,
          after: {
            bankAccountId: input.bankAccountId,
            statementBalance: statementBalance.toFixed(4),
            bookBalance: bookBalance.toFixed(4),
            difference: difference.toFixed(4),
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return reconciliation;
    });
  },

  /**
   * Complete a reconciliation. Recomputes the book balance and difference at
   * completion time (book balance may have moved since the reconciliation was
   * started) and requires the difference to be zero — i.e. statement balance
   * must equal book balance — before allowing completion.
   */
  async complete(ctx: Ctx, id: string) {
    const reconciliation = await this.get(ctx.tenantId, id);
    if (reconciliation.status !== 'in_progress') {
      throw new ConflictError('Reconciliation is not in progress');
    }

    const bankAccount = await bankAccountsService.get(ctx.tenantId, reconciliation.bankAccountId);
    const difference = reconciliation.statementBalance.minus(bankAccount.currentBalance);
    if (!difference.eq(ZERO)) {
      throw new UnprocessableError('Statement balance does not match book balance; resolve the difference first', {
        statementBalance: reconciliation.statementBalance.toFixed(4),
        bookBalance: bankAccount.currentBalance.toFixed(4),
        difference: difference.toFixed(4),
      });
    }

    await prisma.$transaction(async (tx) => {
      await repo.updateReconciliation(
        ctx.tenantId,
        id,
        {
          bookBalance: bankAccount.currentBalance,
          difference,
          status: 'completed',
          completedAt: new Date(),
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'complete',
          module: 'banking',
          entityType: 'reconciliation',
          entityId: id,
          before: { status: reconciliation.status },
          after: { status: 'completed' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },
};
