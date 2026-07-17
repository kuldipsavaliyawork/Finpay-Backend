import { Prisma, prisma } from '../../infrastructure/prisma';
import { NotFoundError, ConflictError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseDateWithFallback, type Ctx } from '../../common/http';
import { ledgerService } from '../ledger/ledger.service';
import { invoicesRepository as repo } from './invoices.repository';
import type { CreateInvoiceInput, UpdateInvoiceInput, InvoiceItemInput } from './invoices.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

interface ComputedItem {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxRateId: string | null;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  accountId: string | null;
  sortOrder: number;
}

/** Compute per-line and invoice totals from raw item input (Decimal-safe). */
function computeItems(items: InvoiceItemInput[]): {
  items: ComputedItem[];
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  let subtotal = ZERO;
  let discountTotal = ZERO;
  let taxTotal = ZERO;

  const computed = items.map((it, idx): ComputedItem => {
    const quantity = new Prisma.Decimal(it.quantity);
    const unitPrice = new Prisma.Decimal(it.unitPrice);
    const discount = new Prisma.Decimal(it.discount ?? 0);
    const taxAmount = new Prisma.Decimal(it.taxAmount ?? 0);
    const lineTotal = quantity.mul(unitPrice).minus(discount);

    subtotal = subtotal.plus(lineTotal);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(taxAmount);

    return {
      description: it.description,
      quantity,
      unitPrice,
      discount,
      taxRateId: it.taxRateId ?? null,
      taxAmount,
      lineTotal,
      accountId: it.accountId ?? null,
      sortOrder: idx,
    };
  });

  const total = subtotal.plus(taxTotal);
  return { items: computed, subtotal, discountTotal, taxTotal, total };
}

export const invoicesService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; status?: string; customerId?: string; sortBy?: 'number' | 'issueDate' | 'dueDate' | 'total' | 'createdAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const invoice = await repo.findById(tenantId, id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    return invoice;
  },

  async create(ctx: Ctx, input: CreateInvoiceInput) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer not found');

    const computed = computeItems(input.items);
    const issueDate = parseDateWithFallback(input.issueDate, new Date());
    const dueDate = parseDateWithFallback(
      input.dueDate,
      new Date(issueDate.getTime() + (customer.paymentTerms ?? 30) * 86_400_000),
    );

    const invoice = await prisma.$transaction(async (tx) => {
      // Reserve the next invoice number from tenant settings.
      const settings = await tx.tenantSettings.update({
        where: { tenantId: ctx.tenantId },
        data: { invoiceNextNumber: { increment: 1 } },
        select: { invoicePrefix: true, invoiceNextNumber: true },
      });
      const number = `${settings.invoicePrefix}${String(settings.invoiceNextNumber - 1).padStart(6, '0')}`;

      const created = await repo.create(
        {
          tenantId: ctx.tenantId,
          number,
          customerId: input.customerId,
          status: 'draft',
          issueDate,
          dueDate,
          currency: input.currency ?? customer.currency ?? 'INR',
          subtotal: computed.subtotal,
          discountTotal: computed.discountTotal,
          taxTotal: computed.taxTotal,
          total: computed.total,
          amountPaid: ZERO,
          balanceDue: computed.total,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
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
          module: 'invoices',
          entityType: 'invoice',
          entityId: created.id,
          after: { number, total: computed.total.toFixed(4) },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });

    return this.get(ctx.tenantId, invoice.id);
  },

  async update(ctx: Ctx, id: string, input: UpdateInvoiceInput) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft invoices can be edited');
    }

    await prisma.$transaction(async (tx) => {
      const data: Prisma.InvoiceUpdateInput = {};
      if (input.issueDate) data.issueDate = parseDateWithFallback(input.issueDate, before.issueDate);
      if (input.dueDate) data.dueDate = parseDateWithFallback(input.dueDate, before.dueDate);
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.terms !== undefined) data.terms = input.terms;

      if (input.items) {
        const computed = computeItems(input.items);
        data.subtotal = computed.subtotal;
        data.discountTotal = computed.discountTotal;
        data.taxTotal = computed.taxTotal;
        data.total = computed.total;
        data.balanceDue = computed.total.minus(before.amountPaid);
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id, tenantId: ctx.tenantId } });
        await tx.invoiceItem.createMany({
          data: computed.items.map((it) => ({ ...it, tenantId: ctx.tenantId, invoiceId: id })),
        });
      }

      await tx.invoice.updateMany({ where: { id, tenantId: ctx.tenantId, deletedAt: null }, data });
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'invoices',
          entityType: 'invoice',
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
   * Post (finalize) a draft invoice: mark it `sent` and record the balanced AR
   * revenue-recognition journal entry:
   *   DR Accounts Receivable (1200) = total
   *   CR Revenue (line income accounts, or 4000) = subtotal
   *   CR GST Payable (2100) = taxTotal
   */
  async post(ctx: Ctx, id: string) {
    const invoice = await this.get(ctx.tenantId, id);
    if (invoice.status !== 'draft') {
      throw new ConflictError('Invoice is already posted');
    }
    if (invoice.total.lte(ZERO)) {
      throw new UnprocessableError('Cannot post a zero-total invoice');
    }

    await prisma.$transaction(async (tx) => {
      const systemCodes = await ledgerService.accountsByCode(ctx.tenantId, ['1200', '4000', '2100'], tx);

      const lines: { accountId: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description?: string }[] = [
        { accountId: systemCodes['1200']!, debit: invoice.total, description: 'Accounts receivable' },
      ];

      // Credit each item's income account (fallback to 4000) for its lineTotal.
      const revenueByAccount = new Map<string, Prisma.Decimal>();
      for (const it of invoice.items) {
        const acct = it.accountId ?? systemCodes['4000']!;
        revenueByAccount.set(acct, (revenueByAccount.get(acct) ?? ZERO).plus(it.lineTotal));
      }
      for (const [accountId, amount] of revenueByAccount) {
        lines.push({ accountId, credit: amount, description: 'Revenue' });
      }
      if (invoice.taxTotal.gt(ZERO)) {
        lines.push({ accountId: systemCodes['2100']!, credit: invoice.taxTotal, description: 'Output GST' });
      }

      const jeId = await ledgerService.postJournalEntry(
        {
          tenantId: ctx.tenantId,
          date: invoice.issueDate,
          memo: `Invoice ${invoice.number}`,
          source: 'invoice',
          sourceId: invoice.id,
          createdBy: ctx.userId,
          lines,
        },
        tx,
      );

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'sent', journalEntryId: jeId, sentAt: new Date() },
      });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'post',
          module: 'invoices',
          entityType: 'invoice',
          entityId: invoice.id,
          after: { journalEntryId: jeId, status: 'sent' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, id);
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'draft') {
      throw new UnprocessableError('Only draft invoices can be deleted; cancel a posted invoice instead');
    }
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'invoices',
      entityType: 'invoice',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },
};
