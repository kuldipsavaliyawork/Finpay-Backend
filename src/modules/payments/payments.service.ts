import { Prisma, prisma } from '../../infrastructure/prisma';
import { NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseDateWithFallback, type Ctx } from '../../common/http';
import { ledgerService } from '../ledger/ledger.service';
import { paymentsRepository as repo } from './payments.repository';
import type { CreatePaymentInput } from './payments.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

export const paymentsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      direction?: string;
      status?: string;
      customerId?: string;
      vendorId?: string;
      sortBy?: 'number' | 'date' | 'amount' | 'createdAt';
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
    const payment = await repo.findById(tenantId, id);
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  },

  /**
   * Record a payment (inbound receipt or outbound disbursement), allocate it
   * across invoices/bills, update each document's amountPaid/balanceDue/status,
   * and post the balanced ledger entry — all inside one transaction:
   *   inbound:  Dr Bank                Cr Accounts Receivable (1200)
   *   outbound: Dr Accounts Payable (2000)  Cr Bank
   */
  async create(ctx: Ctx, input: CreatePaymentInput) {
    const total = new Prisma.Decimal(input.amount);
    const allocTotal = input.allocations.reduce(
      (s, a) => s.plus(new Prisma.Decimal(a.amount)),
      ZERO,
    );
    if (!allocTotal.eq(total)) {
      throw new UnprocessableError('Allocation amounts must sum to the payment amount', {
        amount: total.toFixed(4),
        allocated: allocTotal.toFixed(4),
      });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: input.bankAccountId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!bankAccount) throw new NotFoundError('Bank account not found');

      if (input.direction === 'inbound') {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, tenantId: ctx.tenantId, deletedAt: null },
        });
        if (!customer) throw new NotFoundError('Customer not found');
      } else {
        const vendor = await tx.vendor.findFirst({
          where: { id: input.vendorId, tenantId: ctx.tenantId, deletedAt: null },
        });
        if (!vendor) throw new NotFoundError('Vendor not found');
      }

      // Reserve the next payment number from tenant settings.
      const settings = await tx.tenantSettings.update({
        where: { tenantId: ctx.tenantId },
        data: { paymentNextNumber: { increment: 1 } },
        select: { paymentPrefix: true, paymentNextNumber: true },
      });
      const number = `${settings.paymentPrefix}${String(settings.paymentNextNumber - 1).padStart(6, '0')}`;
      const date = parseDateWithFallback(input.date, new Date());

      const created = await repo.create(
        {
          tenantId: ctx.tenantId,
          number,
          direction: input.direction,
          customerId: input.direction === 'inbound' ? input.customerId! : null,
          vendorId: input.direction === 'outbound' ? input.vendorId! : null,
          bankAccountId: input.bankAccountId,
          date,
          amount: total,
          currency: input.currency ?? bankAccount.currency ?? 'INR',
          method: input.method ?? 'bank',
          reference: input.reference ?? null,
          status: 'completed',
          notes: input.notes ?? null,
          createdBy: ctx.userId,
        },
        tx,
      );

      // Allocate to each invoice/bill, updating amountPaid/balanceDue/status.
      for (const alloc of input.allocations) {
        const amount = new Prisma.Decimal(alloc.amount);

        if (input.direction === 'inbound') {
          const invoice = await tx.invoice.findFirst({
            where: { id: alloc.invoiceId, tenantId: ctx.tenantId, deletedAt: null },
          });
          if (!invoice) throw new NotFoundError(`Invoice ${alloc.invoiceId} not found`);
          if (invoice.status === 'draft' || invoice.status === 'cancelled') {
            throw new UnprocessableError(`Invoice ${invoice.number} cannot receive payment (status: ${invoice.status})`);
          }
          if (amount.gt(invoice.balanceDue)) {
            throw new UnprocessableError(`Allocation exceeds invoice ${invoice.number} balance due`, {
              balanceDue: invoice.balanceDue.toFixed(4),
              allocated: amount.toFixed(4),
            });
          }
          const newBalance = invoice.balanceDue.minus(amount);
          const newPaid = invoice.amountPaid.plus(amount);
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: newPaid,
              balanceDue: newBalance,
              status: newBalance.lte(ZERO) ? 'paid' : 'partial',
            },
          });
        } else {
          const bill = await tx.bill.findFirst({
            where: { id: alloc.billId, tenantId: ctx.tenantId, deletedAt: null },
          });
          if (!bill) throw new NotFoundError(`Bill ${alloc.billId} not found`);
          if (bill.status === 'draft' || bill.status === 'cancelled') {
            throw new UnprocessableError(`Bill ${bill.number} cannot receive payment (status: ${bill.status})`);
          }
          if (amount.gt(bill.balanceDue)) {
            throw new UnprocessableError(`Allocation exceeds bill ${bill.number} balance due`, {
              balanceDue: bill.balanceDue.toFixed(4),
              allocated: amount.toFixed(4),
            });
          }
          const newBalance = bill.balanceDue.minus(amount);
          const newPaid = bill.amountPaid.plus(amount);
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              amountPaid: newPaid,
              balanceDue: newBalance,
              status: newBalance.lte(ZERO) ? 'paid' : 'partial',
            },
          });
        }

        await tx.paymentAllocation.create({
          data: {
            tenantId: ctx.tenantId,
            paymentId: created.id,
            invoiceId: input.direction === 'inbound' ? alloc.invoiceId! : null,
            billId: input.direction === 'outbound' ? alloc.billId! : null,
            amount,
          },
        });
      }

      // Post the balanced ledger entry.
      //   inbound:  Dr Bank(asset)              Cr Accounts Receivable (1200)
      //   outbound: Dr Accounts Payable (2000)   Cr Bank(asset)
      const systemCodes = await ledgerService.accountsByCode(
        ctx.tenantId,
        input.direction === 'inbound' ? ['1200'] : ['2000'],
        tx,
      );

      const lines =
        input.direction === 'inbound'
          ? [
              { accountId: bankAccount.accountId, debit: total, description: `Payment ${number} received` },
              { accountId: systemCodes['1200']!, credit: total, description: 'Accounts receivable' },
            ]
          : [
              { accountId: systemCodes['2000']!, debit: total, description: 'Accounts payable' },
              { accountId: bankAccount.accountId, credit: total, description: `Payment ${number} sent` },
            ];

      const jeId = await ledgerService.postJournalEntry(
        {
          tenantId: ctx.tenantId,
          date,
          memo: `Payment ${number}`,
          source: 'payment',
          sourceId: created.id,
          createdBy: ctx.userId,
          lines,
        },
        tx,
      );

      await tx.payment.update({ where: { id: created.id }, data: { journalEntryId: jeId } });

      // Update the bank account's running balance.
      await tx.bankAccount.update({
        where: { id: bankAccount.id },
        data: {
          currentBalance:
            input.direction === 'inbound'
              ? bankAccount.currentBalance.plus(total)
              : bankAccount.currentBalance.minus(total),
        },
      });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'payments',
          entityType: 'payment',
          entityId: created.id,
          after: { number, direction: input.direction, amount: total.toFixed(4), journalEntryId: jeId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return created;
    });

    return this.get(ctx.tenantId, payment.id);
  },

  /**
   * Void a completed payment: reverse its allocations (restoring the
   * invoice/bill balances), reverse the ledger entry, and mark it failed.
   * Only 'completed' payments can be voided.
   */
  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    if (before.status !== 'completed') {
      throw new UnprocessableError('Only completed payments can be voided');
    }

    await prisma.$transaction(async (tx) => {
      for (const alloc of before.allocations) {
        if (alloc.invoiceId) {
          const invoice = await tx.invoice.findFirst({
            where: { id: alloc.invoiceId, tenantId: ctx.tenantId },
          });
          if (invoice) {
            const newBalance = invoice.balanceDue.plus(alloc.amount);
            const newPaid = invoice.amountPaid.minus(alloc.amount);
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                amountPaid: newPaid.lt(ZERO) ? ZERO : newPaid,
                balanceDue: newBalance,
                status: newBalance.gt(ZERO) ? (newPaid.lte(ZERO) ? 'sent' : 'partial') : 'paid',
              },
            });
          }
        } else if (alloc.billId) {
          const bill = await tx.bill.findFirst({ where: { id: alloc.billId, tenantId: ctx.tenantId } });
          if (bill) {
            const newBalance = bill.balanceDue.plus(alloc.amount);
            const newPaid = bill.amountPaid.minus(alloc.amount);
            await tx.bill.update({
              where: { id: bill.id },
              data: {
                amountPaid: newPaid.lt(ZERO) ? ZERO : newPaid,
                balanceDue: newBalance,
                status: newBalance.gt(ZERO) ? (newPaid.lte(ZERO) ? 'approved' : 'partial') : 'paid',
              },
            });
          }
        }
      }

      if (before.journalEntryId) {
        const original = await tx.journalEntry.findFirst({
          where: { id: before.journalEntryId, tenantId: ctx.tenantId },
          include: { lines: true },
        });
        if (original && original.status === 'posted') {
          const reversalLines = original.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            description: `Reversal: ${l.description ?? ''}`.trim(),
          }));
          const reversalId = await ledgerService.postJournalEntry(
            {
              tenantId: ctx.tenantId,
              date: new Date(),
              memo: `Reversal of ${original.number} (payment void)`,
              source: 'payment',
              sourceId: before.id,
              createdBy: ctx.userId,
              lines: reversalLines,
            },
            tx,
          );
          await tx.journalEntry.update({
            where: { id: original.id },
            data: { status: 'reversed' },
          });
          await tx.journalEntry.update({
            where: { id: reversalId },
            data: { reversalOfId: original.id },
          });
        }

        const bankAccount = before.bankAccountId
          ? await tx.bankAccount.findFirst({ where: { id: before.bankAccountId, tenantId: ctx.tenantId } })
          : null;
        if (bankAccount) {
          await tx.bankAccount.update({
            where: { id: bankAccount.id },
            data: {
              currentBalance:
                before.direction === 'inbound'
                  ? bankAccount.currentBalance.minus(before.amount)
                  : bankAccount.currentBalance.plus(before.amount),
            },
          });
        }
      }

      await tx.payment.update({ where: { id: before.id }, data: { status: 'failed' } });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'delete',
          module: 'payments',
          entityType: 'payment',
          entityId: id,
          before,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });
  },
};
