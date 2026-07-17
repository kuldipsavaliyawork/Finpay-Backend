import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseOptionalDate, type Ctx } from '../../common/http';
import { customersRepository as repo } from './customers.repository';
import { invoiceToStatementLine, paymentToStatementLine } from './customers.mapper';
import type { CreateCustomerInput, UpdateCustomerInput } from './customers.dto';
import type { Paging } from '../../common/pagination/pagination';

export const customersService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; isActive?: boolean; sortBy?: 'name' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const customer = await repo.findById(tenantId, id);
    if (!customer) throw new NotFoundError('Customer not found');
    return customer;
  },

  async create(ctx: Ctx, input: CreateCustomerInput) {
    const dupe = await repo.findByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('A customer with this name already exists', { name: input.name });

    return prisma.$transaction(async (tx) => {
      const customer = await repo.create(
        ctx.tenantId,
        {
          name: input.name,
          displayName: input.displayName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          taxId: input.taxId ?? null,
          billingAddress: input.billingAddress ?? null,
          shippingAddress: input.shippingAddress ?? null,
          currency: input.currency ?? 'INR',
          creditLimit: new Prisma.Decimal(input.creditLimit ?? 0),
          paymentTerms: input.paymentTerms ?? 30,
          notes: input.notes ?? null,
          isActive: input.isActive ?? true,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'customers',
          entityType: 'customer',
          entityId: customer.id,
          after: customer,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return customer;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateCustomerInput) {
    const before = await this.get(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await repo.findByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('A customer with this name already exists', { name: input.name });
      }
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.taxId !== undefined) data.taxId = input.taxId;
    if (input.billingAddress !== undefined) data.billingAddress = input.billingAddress;
    if (input.shippingAddress !== undefined) data.shippingAddress = input.shippingAddress;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.creditLimit !== undefined) data.creditLimit = new Prisma.Decimal(input.creditLimit);
    if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await repo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'customers',
      entityType: 'customer',
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
    // Customers are always soft-deleted (deactivated), never purged, so that
    // historical invoices/payments referencing them remain intact regardless
    // of whether the customer currently has activity.
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'customers',
      entityType: 'customer',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Customer statement — chronological list of invoices (debits, increase
   * receivable) and payments (credits, decrease receivable) with a running
   * balance. Money is kept as Prisma.Decimal throughout; serialized to
   * strings only at the edge.
   */
  async statement(
    tenantId: string,
    customerId: string,
    filters: { from?: string; to?: string },
  ) {
    await this.get(tenantId, customerId); // 404 if customer doesn't exist / wrong tenant

    const from = parseOptionalDate(filters.from);
    const to = parseOptionalDate(filters.to);

    const [invoices, payments] = await Promise.all([
      repo.listInvoicesForStatement(tenantId, customerId, { from, to, skip: 0, take: 10_000 }),
      repo.listPaymentsForStatement(tenantId, customerId, { from, to }),
    ]);

    type Line = { date: Date; type: 'invoice' | 'payment'; id: string; reference: string; amount: Prisma.Decimal };
    const lines: Line[] = [
      ...invoices.map((inv) => {
        const l = invoiceToStatementLine(inv);
        return { ...l, amount: inv.total };
      }),
      ...payments.map((p) => {
        const l = paymentToStatementLine(p);
        return { ...l, amount: p.amount };
      }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = new Prisma.Decimal(0);
    const rows = lines.map((l) => {
      if (l.type === 'invoice') {
        balance = balance.plus(l.amount);
      } else {
        balance = balance.minus(l.amount);
      }
      return {
        type: l.type,
        id: l.id,
        date: l.date.toISOString(),
        reference: l.reference,
        debit: l.type === 'invoice' ? l.amount.toString() : '0.0000',
        credit: l.type === 'payment' ? l.amount.toString() : '0.0000',
        balance: balance.toString(),
      };
    });

    return {
      customerId,
      closingBalance: balance.toString(),
      lines: rows,
      total: rows.length,
    };
  },

  /**
   * Outstanding balance for a single customer — sum of balanceDue across all
   * open (unpaid/partial) invoices.
   */
  async outstandingBalance(tenantId: string, customerId: string) {
    await this.get(tenantId, customerId); // 404 if not found

    const openInvoices = await repo.listOpenInvoices(tenantId, { customerId });
    const outstanding = openInvoices
      .reduce((sum, inv) => sum.plus(inv.balanceDue), new Prisma.Decimal(0));

    return {
      customerId,
      outstandingBalance: outstanding.toString(),
      openInvoiceCount: openInvoices.length,
    };
  },

  /**
   * Accounts-receivable aging — buckets outstanding (unpaid/partial) invoice
   * balances by days past due as of `asOf` (defaults to now). When
   * `customerId` is given, scoped to that customer; otherwise summarizes
   * across all customers and also returns the per-customer breakdown.
   */
  async receivableAging(
    tenantId: string,
    filters: { asOf?: string; customerId?: string },
    paging: Paging,
  ) {
    if (filters.customerId) {
      await this.get(tenantId, filters.customerId); // 404 if not found
    }

    const asOf = parseOptionalDate(filters.asOf) ?? new Date();
    const [openInvoices, total] = await Promise.all([
      repo.listOpenInvoices(tenantId, { customerId: filters.customerId, skip: paging.skip, take: paging.take }),
      repo.countOpenInvoices(tenantId, { customerId: filters.customerId }),
    ]);

    const buckets = {
      current: new Prisma.Decimal(0), // not yet due
      d1_30: new Prisma.Decimal(0),
      d31_60: new Prisma.Decimal(0),
      d61_90: new Prisma.Decimal(0),
      d90_plus: new Prisma.Decimal(0),
    };

    const rows = openInvoices.map((inv) => {
      const daysPastDue = Math.floor((asOf.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      let bucket: keyof typeof buckets;
      if (daysPastDue <= 0) bucket = 'current';
      else if (daysPastDue <= 30) bucket = 'd1_30';
      else if (daysPastDue <= 60) bucket = 'd31_60';
      else if (daysPastDue <= 90) bucket = 'd61_90';
      else bucket = 'd90_plus';

      buckets[bucket] = buckets[bucket].plus(inv.balanceDue);

      return {
        invoiceId: inv.id,
        customerId: inv.customerId,
        number: inv.number,
        dueDate: inv.dueDate.toISOString(),
        daysPastDue,
        bucket,
        balanceDue: inv.balanceDue.toString(),
      };
    });

    return {
      asOf: asOf.toISOString(),
      summary: {
        current: buckets.current.toString(),
        d1_30: buckets.d1_30.toString(),
        d31_60: buckets.d31_60.toString(),
        d61_90: buckets.d61_90.toString(),
        d90_plus: buckets.d90_plus.toString(),
        total: Object.values(buckets)
          .reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0))
          .toString(),
      },
      rows,
      total,
    };
  },
};
