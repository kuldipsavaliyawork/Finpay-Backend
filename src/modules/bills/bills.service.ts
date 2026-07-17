import { Prisma, prisma } from '../../infrastructure/prisma';
import { NotFoundError, ConflictError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseDateWithFallback, type Ctx } from '../../common/http';
import { ledgerService } from '../ledger/ledger.service';
import { billsRepository as repo } from './bills.repository';
import type { CreateBillInput, UpdateBillInput, BillItemInput, BillStatus } from './bills.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

/** Default system account codes used when a bill line has no explicit account. */
const DEFAULT_EXPENSE_CODE = '5000'; // Cost of Services (fallback expense account)
const INPUT_TAX_CODE = '2100'; // GST Payable (used bidirectionally as input tax here)
const ACCOUNTS_PAYABLE_CODE = '2000'; // Accounts Payable

interface ComputedItem {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRateId: string | null;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  accountId: string | null;
  sortOrder: number;
}

/** Compute per-line and bill totals from raw item input (Decimal-safe). */
function computeItems(items: BillItemInput[]): {
  items: ComputedItem[];
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  let subtotal = ZERO;
  let taxTotal = ZERO;

  const computed = items.map((it, idx): ComputedItem => {
    const quantity = new Prisma.Decimal(it.quantity);
    const unitPrice = new Prisma.Decimal(it.unitPrice);
    const taxAmount = new Prisma.Decimal(it.taxAmount ?? 0);
    const lineTotal = quantity.mul(unitPrice);

    subtotal = subtotal.plus(lineTotal);
    taxTotal = taxTotal.plus(taxAmount);

    return {
      description: it.description,
      quantity,
      unitPrice,
      taxRateId: it.taxRateId ?? null,
      taxAmount,
      lineTotal,
      accountId: it.accountId ?? null,
      sortOrder: idx,
    };
  });

  const total = subtotal.plus(taxTotal);
  return { items: computed, subtotal, taxTotal, total };
}

/** Legal forward transitions for the bill status lifecycle. */
const ALLOWED_TRANSITIONS: Record<BillStatus, readonly BillStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'cancelled'],
  approved: ['partial', 'paid', 'overdue', 'cancelled'],
  partial: ['paid', 'overdue', 'cancelled'],
  paid: [],
  overdue: ['partial', 'paid', 'cancelled'],
  cancelled: [],
};

function assertTransition(from: string, to: BillStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from as BillStatus];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(`Cannot transition bill from '${from}' to '${to}'`, { from, to });
  }
}

export const billsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      status?: string;
      vendorId?: string;
      sortBy?: 'number' | 'issueDate' | 'dueDate' | 'total' | 'createdAt';
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
    const bill = await repo.findById(tenantId, id);
    if (!bill) throw new NotFoundError('Bill not found');
    return bill;
  },

  /**
   * Create a draft bill. Numbering is reserved atomically from
   * TenantSettings.billNextNumber inside the same transaction as the insert,
   * so concurrent creates never collide on the unique (tenantId, number).
   */
  async create(ctx: Ctx, input: CreateBillInput) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!vendor) throw new NotFoundError('Vendor not found');

    const computed = computeItems(input.items);
    const issueDate = parseDateWithFallback(input.issueDate, new Date());
    const dueDate = parseDateWithFallback(
      input.dueDate,
      new Date(issueDate.getTime() + (vendor.paymentTerms ?? 30) * 86_400_000),
    );

    const bill = await prisma.$transaction(async (tx) => {
      // Reserve the next bill number from tenant settings (atomic increment).
      const settings = await tx.tenantSettings.update({
        where: { tenantId: ctx.tenantId },
        data: { billNextNumber: { increment: 1 } },
        select: { billPrefix: true, billNextNumber: true },
      });
      const number = `${settings.billPrefix}${String(settings.billNextNumber - 1).padStart(6, '0')}`;

      const created = await repo.create(
        {
          tenantId: ctx.tenantId,
          number,
          vendorId: input.vendorId,
          status: 'draft',
          issueDate,
          dueDate,
          currency: input.currency ?? vendor.currency ?? 'INR',
          subtotal: computed.subtotal,
          taxTotal: computed.taxTotal,
          total: computed.total,
          amountPaid: ZERO,
          balanceDue: computed.total,
          notes: input.notes ?? null,
          createdBy: ctx.userId,
          items: {
            createMany: {
              data: computed.items.map((it) => ({ ...it, tenantId: ctx.tenantId })),
            },
          },
        },
        tx,
      );

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'bills',
          entityType: 'bill',
          entityId: created.id,
          after: { number, total: computed.total.toFixed(4) },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });

    return this.get(ctx.tenantId, bill.id);
  },

  async update(ctx: Ctx, id: string, input: UpdateBillInput) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft bills can be edited');
    }

    await prisma.$transaction(async (tx) => {
      const data: Prisma.BillUpdateInput = {};
      if (input.issueDate) data.issueDate = parseDateWithFallback(input.issueDate, before.issueDate);
      if (input.dueDate) data.dueDate = parseDateWithFallback(input.dueDate, before.dueDate);
      if (input.notes !== undefined) data.notes = input.notes;

      if (input.items) {
        const computed = computeItems(input.items);
        data.subtotal = computed.subtotal;
        data.taxTotal = computed.taxTotal;
        data.total = computed.total;
        data.balanceDue = computed.total.minus(before.amountPaid);
        await tx.billItem.deleteMany({ where: { billId: id, tenantId: ctx.tenantId } });
        await tx.billItem.createMany({
          data: computed.items.map((it) => ({ ...it, tenantId: ctx.tenantId, billId: id })),
        });
      }

      await tx.bill.updateMany({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, data });
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'bills',
          entityType: 'bill',
          entityId: id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /**
   * Submit a draft bill for approval: draft -> pending. Purely a status
   * transition; no ledger effect until `approve`.
   */
  async submit(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    assertTransition(before.status, 'pending');

    await repo.update(ctx.tenantId, id, { status: 'pending' });
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'submit',
      module: 'bills',
      entityType: 'bill',
      entityId: id,
      before: { status: before.status },
      after: { status: 'pending' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.get(ctx.tenantId, id);
  },

  /**
   * Approve (post) a pending bill: pending -> approved, and record the
   * balanced AP journal entry:
   *   DR Expense (per item's accountId, fallback 5000) = subtotal (by account)
   *   DR Input Tax / GST Payable (2100)                = taxTotal
   *   CR Accounts Payable (2000)                        = total
   *
   * Idempotency is enforced at the route layer via the Idempotency-Key
   * header (see bills.routes.ts); this method also guards against
   * double-posting by requiring the current status to be 'pending'.
   */
  async approve(ctx: Ctx, id: string) {
    const bill = await this.get(ctx.tenantId, id);
    assertTransition(bill.status, 'approved');
    if (bill.total.lte(ZERO)) {
      throw new UnprocessableError('Cannot approve a zero-total bill');
    }
    if (bill.journalEntryId) {
      throw new ConflictError('Bill is already posted to the ledger');
    }

    await prisma.$transaction(async (tx) => {
      const systemCodes = await ledgerService.accountsByCode(
        ctx.tenantId,
        [DEFAULT_EXPENSE_CODE, INPUT_TAX_CODE, ACCOUNTS_PAYABLE_CODE],
        tx,
      );

      // Debit each item's expense account (fallback to 5000) for its lineTotal.
      const expenseByAccount = new Map<string, Prisma.Decimal>();
      for (const it of bill.items) {
        const acct = it.accountId ?? systemCodes[DEFAULT_EXPENSE_CODE]!;
        expenseByAccount.set(acct, (expenseByAccount.get(acct) ?? ZERO).plus(it.lineTotal));
      }

      const lines: { accountId: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description?: string }[] = [];
      for (const [accountId, amount] of expenseByAccount) {
        lines.push({ accountId, debit: amount, description: 'Expense' });
      }
      if (bill.taxTotal.gt(ZERO)) {
        lines.push({ accountId: systemCodes[INPUT_TAX_CODE]!, debit: bill.taxTotal, description: 'Input tax' });
      }
      lines.push({ accountId: systemCodes[ACCOUNTS_PAYABLE_CODE]!, credit: bill.total, description: 'Accounts payable' });

      const jeId = await ledgerService.postJournalEntry(
        {
          tenantId: ctx.tenantId,
          date: bill.issueDate,
          memo: `Bill ${bill.number}`,
          source: 'bill',
          sourceId: bill.id,
          createdBy: ctx.userId,
          lines,
        },
        tx,
      );

      await tx.bill.update({
        where: { id: bill.id },
        data: { status: 'approved', journalEntryId: jeId },
      });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'approve',
          module: 'bills',
          entityType: 'bill',
          entityId: bill.id,
          before: { status: bill.status },
          after: { status: 'approved', journalEntryId: jeId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  /**
   * Cancel a bill. Allowed from any non-terminal status per the transition
   * table. Cancelling a bill that has already been posted to the ledger does
   * NOT reverse the journal entry automatically — that must go through the
   * ledger's reversal flow (out of scope here); we only guard against
   * cancelling bills that already have payments allocated.
   */
  async cancel(ctx: Ctx, id: string, reason?: string) {
    const before = await this.get(ctx.tenantId, id);
    assertTransition(before.status, 'cancelled');
    if (before.amountPaid.gt(ZERO)) {
      throw new UnprocessableError('Cannot cancel a bill that has payments applied');
    }

    await repo.update(ctx.tenantId, id, { status: 'cancelled' });
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'cancel',
      module: 'bills',
      entityType: 'bill',
      entityId: id,
      before: { status: before.status },
      after: { status: 'cancelled', reason: reason ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.get(ctx.tenantId, id);
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft bills can be deleted; cancel a posted bill instead');
    }
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'bills',
      entityType: 'bill',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },
};
