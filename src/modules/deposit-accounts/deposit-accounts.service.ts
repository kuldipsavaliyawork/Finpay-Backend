import { randomInt } from 'node:crypto';
import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { requireDate, type Ctx } from '../../common/http';
import { depositAccountsRepository as repo } from './deposit-accounts.repository';
import type {
  OpenDepositAccountInput,
  UpdateDepositAccountInput,
  CreateTransferInput,
} from './deposit-accounts.dto';
import type { Paging } from '../../common/pagination/pagination';

/** Generate a 12-digit numeric account number (no leading zero). */
function genAccountNumber(): string {
  let s = String(randomInt(1, 10));
  for (let i = 0; i < 11; i++) s += String(randomInt(0, 10));
  return s;
}

/** Allocate an account number not already in use (retry a few times on collision). */
async function uniqueAccountNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = genAccountNumber();
    const existing = await repo.findByAccountNumber(candidate);
    if (!existing) return candidate;
  }
  throw new ConflictError('Could not allocate a unique account number. Please retry.');
}

// ── Deposit accounts ─────────────────────────────────────────────────────────

export const depositAccountsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      customerId?: string;
      type?: string;
      status?: string;
      sortBy?: 'accountNumber' | 'balance' | 'createdAt' | 'openedAt';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const account = await repo.findByIdWithCustomer(tenantId, id);
    if (!account) throw new NotFoundError('Deposit account not found');
    return account;
  },

  /** Total balance across all (non-deleted) deposit accounts — for KPIs. */
  async totalBalance(tenantId: string): Promise<string> {
    const agg = await repo.sumBalance(tenantId);
    return (agg._sum.balance ?? new Prisma.Decimal(0)).toString();
  },

  async open(ctx: Ctx, input: OpenDepositAccountInput) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer (account holder) not found');

    const currency = input.currency ?? customer.currency ?? 'INR';
    const opening = new Prisma.Decimal(input.openingBalance ?? 0);
    const accountNumber = await uniqueAccountNumber();

    return prisma.$transaction(async (tx) => {
      const account = await repo.create(
        ctx.tenantId,
        {
          customerId: input.customerId,
          accountNumber,
          type: input.type ?? 'savings',
          currency,
          balance: opening,
          status: 'active',
        },
        tx,
      );

      // Seed the statement with an opening-balance credit so the ledger reconciles.
      if (opening.greaterThan(0)) {
        await repo.createTransaction(
          ctx.tenantId,
          {
            depositAccountId: account.id,
            type: 'credit',
            amount: opening,
            balanceAfter: opening,
            description: 'Opening balance',
          },
          tx,
        );
      }

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'deposit-accounts',
          entityType: 'deposit_account',
          entityId: account.id,
          after: account,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return account;
    });
  },

  async updateStatus(ctx: Ctx, id: string, input: UpdateDepositAccountInput) {
    const before = await repo.findById(ctx.tenantId, id);
    if (!before) throw new NotFoundError('Deposit account not found');

    if (before.status === 'closed') {
      throw new UnprocessableError('This account is closed and can no longer change status');
    }
    if (input.status === 'closed' && before.balance.greaterThan(0)) {
      throw new UnprocessableError('Account balance must be zero before it can be closed', {
        balance: before.balance.toString(),
      });
    }

    await repo.update(ctx.tenantId, id, { status: input.status });
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'deposit-accounts',
      entityType: 'deposit_account',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async listTransactions(
    tenantId: string,
    accountId: string,
    paging: Paging,
    filters: { type?: string; from?: string; to?: string; sortBy?: 'date' | 'createdAt'; sortDir?: 'asc' | 'desc' },
  ) {
    // Ensure the account exists in this tenant before returning its statement.
    const account = await repo.findById(tenantId, accountId);
    if (!account) throw new NotFoundError('Deposit account not found');

    const args = {
      skip: paging.skip,
      take: paging.take,
      type: filters.type,
      from: filters.from ? requireDate(filters.from) : undefined,
      to: filters.to ? requireDate(filters.to) : undefined,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    };
    const [items, total] = await Promise.all([
      repo.listTransactions(tenantId, accountId, args),
      repo.countTransactions(tenantId, accountId, args),
    ]);
    return [items, total] as const;
  },
};

// ── Transfers ────────────────────────────────────────────────────────────────

export const transfersService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { accountId?: string; sortBy?: 'createdAt' | 'amount'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listTransfers(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countTransfers(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const transfer = await repo.findTransferById(tenantId, id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    return transfer;
  },

  /**
   * Move value atomically between two of the tenant's deposit accounts:
   * writes a Transfer + a debit leg on the source + a credit leg on the
   * destination, and updates both balances — all inside one DB transaction.
   */
  async create(ctx: Ctx, input: CreateTransferInput) {
    const amount = new Prisma.Decimal(input.amount);

    const created = await prisma.$transaction(async (tx) => {
      const from = await repo.findById(ctx.tenantId, input.fromAccountId, tx);
      if (!from) throw new NotFoundError('Source account not found');
      const to = await repo.findById(ctx.tenantId, input.toAccountId, tx);
      if (!to) throw new NotFoundError('Destination account not found');

      if (from.status !== 'active') {
        throw new UnprocessableError(`Source account is ${from.status} and cannot send funds`);
      }
      if (to.status !== 'active') {
        throw new UnprocessableError(`Destination account is ${to.status} and cannot receive funds`);
      }
      if (from.currency !== to.currency) {
        throw new UnprocessableError('Cross-currency transfers are not supported yet', {
          from: from.currency,
          to: to.currency,
        });
      }
      if (from.balance.lessThan(amount)) {
        throw new UnprocessableError('Insufficient balance in the source account', {
          balance: from.balance.toString(),
          amount: amount.toString(),
        });
      }

      const transfer = await repo.createTransfer(
        ctx.tenantId,
        {
          fromAccountId: from.id,
          toAccountId: to.id,
          amount,
          currency: from.currency,
          reference: input.reference ?? null,
          description: input.description ?? null,
          status: 'completed',
          createdBy: ctx.userId,
        },
        tx,
      );

      // Debit source
      const fromBalance = from.balance.sub(amount);
      await repo.update(ctx.tenantId, from.id, { balance: fromBalance }, tx);
      await repo.createTransaction(
        ctx.tenantId,
        {
          depositAccountId: from.id,
          type: 'debit',
          amount,
          balanceAfter: fromBalance,
          description: input.description ?? `Transfer to ${to.accountNumber}`,
          reference: input.reference ?? null,
          transferId: transfer.id,
        },
        tx,
      );

      // Credit destination
      const toBalance = to.balance.add(amount);
      await repo.update(ctx.tenantId, to.id, { balance: toBalance }, tx);
      await repo.createTransaction(
        ctx.tenantId,
        {
          depositAccountId: to.id,
          type: 'credit',
          amount,
          balanceAfter: toBalance,
          description: input.description ?? `Transfer from ${from.accountNumber}`,
          reference: input.reference ?? null,
          transferId: transfer.id,
        },
        tx,
      );

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'deposit-accounts',
          entityType: 'transfer',
          entityId: transfer.id,
          after: transfer,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return transfer;
    });

    // Re-read with account numbers for the response.
    return this.get(ctx.tenantId, created.id);
  },
};
