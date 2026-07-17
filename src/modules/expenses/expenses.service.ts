import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseDateWithFallback, type Ctx } from '../../common/http';
import { ledgerService } from '../ledger/ledger.service';
import {
  expenseCategoriesRepository as categoriesRepo,
  expensesRepository as repo,
} from './expenses.repository';
import type {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  CreateExpenseInput,
  UpdateExpenseInput,
} from './expenses.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

// ── Expense categories ──────────────────────────────────────────────────────

export const expenseCategoriesService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; isActive?: boolean; sortBy?: 'name' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      categoriesRepo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      categoriesRepo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const category = await categoriesRepo.findById(tenantId, id);
    if (!category) throw new NotFoundError('Expense category not found');
    return category;
  },

  async create(ctx: Ctx, input: CreateExpenseCategoryInput) {
    const dupe = await categoriesRepo.findByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('An expense category with this name already exists', { name: input.name });

    if (input.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: input.accountId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!account) throw new NotFoundError('Account not found');
    }

    return prisma.$transaction(async (tx) => {
      const category = await categoriesRepo.create(
        ctx.tenantId,
        {
          name: input.name,
          accountId: input.accountId ?? null,
          isActive: input.isActive ?? true,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'expenses',
          entityType: 'expense_category',
          entityId: category.id,
          after: category,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return category;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateExpenseCategoryInput) {
    const before = await this.get(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await categoriesRepo.findByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('An expense category with this name already exists', { name: input.name });
      }
    }
    if (input.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: input.accountId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!account) throw new NotFoundError('Account not found');
    }

    const data: Prisma.ExpenseCategoryUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.accountId !== undefined) data.accountId = input.accountId;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await categoriesRepo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'expenses',
      entityType: 'expense_category',
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
    const usageCount = await categoriesRepo.countExpensesUsingCategory(ctx.tenantId, id);
    if (usageCount > 0) {
      throw new ConflictError('Cannot delete a category that is used by existing expenses', { usageCount });
    }
    await categoriesRepo.remove(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'expenses',
      entityType: 'expense_category',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },
};

// ── Expenses ─────────────────────────────────────────────────────────────────

/** Status transition graph for the expense approval workflow. */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  approved: ['reimbursed'],
  rejected: ['pending'],
  reimbursed: [],
};

function assertTransition(from: string, to: string): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new UnprocessableError(`Cannot transition expense from '${from}' to '${to}'`, { from, to });
  }
}

export const expensesService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      status?: string;
      categoryId?: string;
      vendorId?: string;
      departmentId?: string;
      from?: string;
      to?: string;
      sortBy?: 'date' | 'amount' | 'status' | 'createdAt';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const from = parseDateWithFallback(filters.from, undefined as unknown as Date);
    const to = parseDateWithFallback(filters.to, undefined as unknown as Date);
    const [items, total] = await Promise.all([
      repo.list(tenantId, {
        skip: paging.skip,
        take: paging.take,
        q: filters.q,
        status: filters.status,
        categoryId: filters.categoryId,
        vendorId: filters.vendorId,
        departmentId: filters.departmentId,
        from: filters.from ? from : undefined,
        to: filters.to ? to : undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      }),
      repo.count(tenantId, {
        q: filters.q,
        status: filters.status,
        categoryId: filters.categoryId,
        vendorId: filters.vendorId,
        departmentId: filters.departmentId,
        from: filters.from ? from : undefined,
        to: filters.to ? to : undefined,
      }),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const expense = await repo.findById(tenantId, id);
    if (!expense) throw new NotFoundError('Expense not found');
    return expense;
  },

  async create(ctx: Ctx, input: CreateExpenseInput) {
    if (input.categoryId) {
      const category = await categoriesRepo.findById(ctx.tenantId, input.categoryId);
      if (!category) throw new NotFoundError('Expense category not found');
    }
    if (input.vendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: input.vendorId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!vendor) throw new NotFoundError('Vendor not found');
    }
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!department) throw new NotFoundError('Department not found');
    }

    const date = parseDateWithFallback(input.date, new Date());
    const amount = new Prisma.Decimal(input.amount);
    const taxAmount = new Prisma.Decimal(input.taxAmount ?? 0);
    const reference = input.reference ?? `EXP-${Date.now()}`;

    const expense = await prisma.$transaction(async (tx) => {
      const created = await repo.create(
        ctx.tenantId,
        {
          reference,
          categoryId: input.categoryId ?? null,
          vendorId: input.vendorId ?? null,
          departmentId: input.departmentId ?? null,
          date,
          amount,
          taxAmount,
          currency: input.currency ?? 'INR',
          description: input.description ?? null,
          status: 'draft',
          paymentMethod: input.paymentMethod ?? null,
          isReimbursable: input.isReimbursable ?? false,
          isRecurring: input.isRecurring ?? false,
          receiptUrl: input.receiptUrl ?? null,
          createdBy: ctx.userId,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'expenses',
          entityType: 'expense',
          entityId: created.id,
          after: { reference, amount: amount.toFixed(4) },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });

    return this.get(ctx.tenantId, expense.id);
  },

  async update(ctx: Ctx, id: string, input: UpdateExpenseInput) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft expenses can be edited');
    }

    if (input.categoryId) {
      const category = await categoriesRepo.findById(ctx.tenantId, input.categoryId);
      if (!category) throw new NotFoundError('Expense category not found');
    }
    if (input.vendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: input.vendorId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!vendor) throw new NotFoundError('Vendor not found');
    }
    if (input.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.departmentId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!department) throw new NotFoundError('Department not found');
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (input.reference !== undefined) data.reference = input.reference;
    if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
    if (input.vendorId !== undefined) data.vendor = { connect: { id: input.vendorId } };
    if (input.departmentId !== undefined) data.department = { connect: { id: input.departmentId } };
    if (input.date !== undefined) data.date = parseDateWithFallback(input.date, before.date);
    if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
    if (input.taxAmount !== undefined) data.taxAmount = new Prisma.Decimal(input.taxAmount);
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.description !== undefined) data.description = input.description;
    if (input.paymentMethod !== undefined) data.paymentMethod = input.paymentMethod;
    if (input.isReimbursable !== undefined) data.isReimbursable = input.isReimbursable;
    if (input.isRecurring !== undefined) data.isRecurring = input.isRecurring;
    if (input.receiptUrl !== undefined) data.receiptUrl = input.receiptUrl;

    await repo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'expenses',
      entityType: 'expense',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft' && before.status !== 'rejected') {
      throw new UnprocessableError('Only draft or rejected expenses can be deleted');
    }
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'expenses',
      entityType: 'expense',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /** Submit a draft (or resubmit a rejected) expense for approval. */
  async submit(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    assertTransition(before.status, 'pending');

    await prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        data: { status: 'pending' },
      });
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'submit',
          module: 'expenses',
          entityType: 'expense',
          entityId: id,
          before: { status: before.status },
          after: { status: 'pending' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /**
   * Approve a pending expense: mark it `approved` and post the balanced
   * expense-recognition journal entry:
   *   DR Expense (category account, or 5000 fallback) = amount + taxAmount
   *   CR Cash/Bank (1000 cash | 1010 bank, based on paymentMethod) = amount + taxAmount
   */
  async approve(ctx: Ctx, id: string) {
    const expense = await this.get(ctx.tenantId, id);
    assertTransition(expense.status, 'approved');

    const total = expense.amount.plus(expense.taxAmount);
    if (total.lte(ZERO)) {
      throw new UnprocessableError('Cannot approve a zero-total expense');
    }

    const jeId = await prisma.$transaction(async (tx) => {
      const cashCode = expense.paymentMethod === 'bank' ? '1010' : '1000';
      const systemCodes = await ledgerService.accountsByCode(ctx.tenantId, [cashCode, '5000'], tx);

      let expenseAccountId = expense.category?.accountId ?? null;
      if (!expenseAccountId) {
        expenseAccountId = systemCodes['5000']!;
      } else {
        const account = await tx.account.findFirst({
          where: { id: expenseAccountId, tenantId: ctx.tenantId, deletedAt: null },
        });
        if (!account) expenseAccountId = systemCodes['5000']!;
      }

      const entryId = await ledgerService.postJournalEntry(
        {
          tenantId: ctx.tenantId,
          date: expense.date,
          memo: `Expense ${expense.reference}`,
          source: 'expense',
          sourceId: expense.id,
          createdBy: ctx.userId,
          lines: [
            { accountId: expenseAccountId, debit: total, description: 'Expense' },
            { accountId: systemCodes[cashCode]!, credit: total, description: 'Cash/Bank payment' },
          ],
        },
        tx,
      );

      await tx.expense.update({
        where: { id: expense.id },
        data: { status: 'approved', journalEntryId: entryId },
      });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'approve',
          module: 'expenses',
          entityType: 'expense',
          entityId: expense.id,
          before: { status: expense.status },
          after: { status: 'approved', journalEntryId: entryId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return entryId;
    });

    void jeId;
    return this.get(ctx.tenantId, id);
  },

  /** Reject a pending expense, optionally recording a reason. */
  async reject(ctx: Ctx, id: string, reason?: string) {
    const before = await this.get(ctx.tenantId, id);
    assertTransition(before.status, 'rejected');

    await prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        data: { status: 'rejected' },
      });
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'reject',
          module: 'expenses',
          entityType: 'expense',
          entityId: id,
          before: { status: before.status },
          after: { status: 'rejected', reason: reason ?? null },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /** Mark an approved expense as reimbursed (terminal state; no ledger effect here). */
  async markReimbursed(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    assertTransition(before.status, 'reimbursed');

    await repo.update(ctx.tenantId, id, { status: 'reimbursed' });
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'reimburse',
      module: 'expenses',
      entityType: 'expense',
      entityId: id,
      before: { status: before.status },
      after: { status: 'reimbursed' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.get(ctx.tenantId, id);
  },
};
