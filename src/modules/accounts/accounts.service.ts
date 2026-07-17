import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseOptionalDate, type Ctx } from '../../common/http';
import { accountsRepository as repo } from './accounts.repository';
import { buildAccountTree } from './accounts.mapper';
import type { CreateAccountInput, UpdateAccountInput } from './accounts.dto';
import type { Paging } from '../../common/pagination/pagination';

/** Signed balance convention: asset/expense are debit-normal, others credit-normal. */
function isDebitNormal(type: string): boolean {
  return type === 'asset' || type === 'expense';
}

export const accountsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      type?: string;
      isActive?: boolean;
      parentId?: string;
      sortBy?: 'code' | 'name' | 'createdAt' | 'updatedAt';
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
    const account = await repo.findById(tenantId, id);
    if (!account) throw new NotFoundError('Account not found');
    return account;
  },

  /**
   * Validate a candidate parentId: must exist in-tenant, and must not create a
   * cycle (walk up the candidate parent's ancestor chain looking for `id`).
   */
  async assertValidParent(tenantId: string, id: string | undefined, parentId: string | null | undefined) {
    if (!parentId) return;
    if (parentId === id) {
      throw new UnprocessableError('An account cannot be its own parent');
    }
    const parent = await repo.findById(tenantId, parentId);
    if (!parent) throw new NotFoundError('Parent account not found', { parentId });

    if (id) {
      let cursor: string | null = parent.parentId;
      const seen = new Set<string>([id]);
      while (cursor) {
        if (seen.has(cursor)) {
          throw new UnprocessableError('Setting this parent would create a cycle in the account tree');
        }
        seen.add(cursor);
        const next: { parentId: string | null } | null = await repo.findById(tenantId, cursor);
        if (!next) break;
        cursor = next.parentId;
      }
    }
  },

  async create(ctx: Ctx, input: CreateAccountInput) {
    const dupe = await repo.findByCode(ctx.tenantId, input.code);
    if (dupe) throw new ConflictError('An account with this code already exists', { code: input.code });

    await this.assertValidParent(ctx.tenantId, undefined, input.parentId ?? null);

    return prisma.$transaction(async (tx) => {
      const account = await repo.create(
        ctx.tenantId,
        {
          code: input.code,
          name: input.name,
          type: input.type,
          subtype: input.subtype ?? null,
          parentId: input.parentId ?? null,
          isActive: input.isActive ?? true,
          isSystem: input.isSystem ?? false,
          openingBalance: new Prisma.Decimal(input.openingBalance ?? 0),
          currency: input.currency ?? 'INR',
          description: input.description ?? null,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'accounts',
          entityType: 'account',
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

  async update(ctx: Ctx, id: string, input: UpdateAccountInput) {
    const before = await this.get(ctx.tenantId, id);

    if (input.code && input.code !== before.code) {
      const dupe = await repo.findByCode(ctx.tenantId, input.code);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('An account with this code already exists', { code: input.code });
      }
    }

    if (input.parentId !== undefined) {
      await this.assertValidParent(ctx.tenantId, id, input.parentId);
    }

    const data: Prisma.AccountUpdateInput = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.subtype !== undefined) data.subtype = input.subtype;
    if (input.parentId !== undefined) data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.description !== undefined) data.description = input.description;
    if (input.openingBalance !== undefined) data.openingBalance = new Prisma.Decimal(input.openingBalance);

    await repo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'accounts',
      entityType: 'account',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async setActive(ctx: Ctx, id: string, isActive: boolean) {
    const before = await this.get(ctx.tenantId, id);
    if (before.isActive === isActive) return before;

    await repo.update(ctx.tenantId, id, { isActive });
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: isActive ? 'activate' : 'deactivate',
      module: 'accounts',
      entityType: 'account',
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

    if (before.isSystem) {
      throw new UnprocessableError('System accounts cannot be deleted', { id, code: before.code });
    }

    const childCount = await repo.countChildren(ctx.tenantId, id);
    if (childCount > 0) {
      throw new ConflictError('Account has child accounts and cannot be deleted', { id, childCount });
    }

    const { debit, credit } = await repo.sumJournalLines(ctx.tenantId, id, undefined);
    if (!debit.eq(0) || !credit.eq(0)) {
      throw new ConflictError('Account has posted journal activity and cannot be deleted', { id });
    }

    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'accounts',
      entityType: 'account',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /** Hierarchical tree of all (optionally filtered) accounts for the tenant. */
  async tree(tenantId: string, filters: { type?: string; includeInactive?: boolean }) {
    const accounts = await repo.listAll(tenantId, filters);
    return buildAccountTree(accounts);
  },

  /**
   * Per-account balance = opening balance + posted journal activity (through
   * `asOf` when given), signed per the account's normal-balance convention
   * (debit-normal for asset/expense, credit-normal for liability/equity/income).
   */
  async balance(tenantId: string, id: string, filters: { asOf?: string }) {
    const account = await this.get(tenantId, id);
    const asOf = parseOptionalDate(filters.asOf);

    const { debit, credit } = await repo.sumJournalLines(tenantId, id, asOf);
    const netDebit = debit.minus(credit);
    const activity = isDebitNormal(account.type) ? netDebit : netDebit.negated();
    const balance = account.openingBalance.plus(activity);

    return {
      accountId: id,
      code: account.code,
      name: account.name,
      type: account.type,
      currency: account.currency,
      asOf: asOf ? asOf.toISOString() : null,
      openingBalance: account.openingBalance.toString(),
      periodDebit: debit.toString(),
      periodCredit: credit.toString(),
      balance: balance.toString(),
    };
  },
};
