import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseOptionalDate, type Ctx } from '../../common/http';
import { vendorsRepository as repo } from './vendors.repository';
import { billToStatementLine, paymentToStatementLine } from './vendors.mapper';
import type { CreateVendorInput, UpdateVendorInput } from './vendors.dto';
import type { Paging } from '../../common/pagination/pagination';

export const vendorsService = {
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
    const vendor = await repo.findById(tenantId, id);
    if (!vendor) throw new NotFoundError('Vendor not found');
    return vendor;
  },

  async create(ctx: Ctx, input: CreateVendorInput) {
    const dupe = await repo.findByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('A vendor with this name already exists', { name: input.name });

    return prisma.$transaction(async (tx) => {
      const vendor = await repo.create(
        ctx.tenantId,
        {
          name: input.name,
          displayName: input.displayName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          taxId: input.taxId ?? null,
          address: input.address ?? null,
          currency: input.currency ?? 'INR',
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
          module: 'vendors',
          entityType: 'vendor',
          entityId: vendor.id,
          after: vendor,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return vendor;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateVendorInput) {
    const before = await this.get(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await repo.findByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('A vendor with this name already exists', { name: input.name });
      }
    }

    const data: Prisma.VendorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.taxId !== undefined) data.taxId = input.taxId;
    if (input.address !== undefined) data.address = input.address;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await repo.update(ctx.tenantId, id, data);
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'vendors',
      entityType: 'vendor',
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
    // Vendors are always soft-deleted (deactivated), never purged, so that
    // historical bills/payments referencing them remain intact regardless of
    // whether the vendor currently has activity.
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'vendors',
      entityType: 'vendor',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Vendor statement — chronological list of bills (debits, increase payable)
   * and payments (credits, decrease payable) with a running balance. Money is
   * kept as Prisma.Decimal throughout; serialized to strings only at the edge.
   */
  async statement(
    tenantId: string,
    vendorId: string,
    filters: { from?: string; to?: string },
  ) {
    await this.get(tenantId, vendorId); // 404 if vendor doesn't exist / wrong tenant

    const from = parseOptionalDate(filters.from);
    const to = parseOptionalDate(filters.to);

    const [bills, payments] = await Promise.all([
      repo.listBillsForStatement(tenantId, vendorId, { from, to, skip: 0, take: 10_000 }),
      repo.listPaymentsForStatement(tenantId, vendorId, { from, to }),
    ]);

    type Line = { date: Date; type: 'bill' | 'payment'; id: string; reference: string; amount: Prisma.Decimal };
    const lines: Line[] = [
      ...bills.map((b) => {
        const l = billToStatementLine(b);
        return { ...l, amount: b.total };
      }),
      ...payments.map((p) => {
        const l = paymentToStatementLine(p);
        return { ...l, amount: p.amount };
      }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = new Prisma.Decimal(0);
    const rows = lines.map((l) => {
      if (l.type === 'bill') {
        balance = balance.plus(l.amount);
      } else {
        balance = balance.minus(l.amount);
      }
      return {
        type: l.type,
        id: l.id,
        date: l.date.toISOString(),
        reference: l.reference,
        debit: l.type === 'bill' ? l.amount.toString() : '0.0000',
        credit: l.type === 'payment' ? l.amount.toString() : '0.0000',
        balance: balance.toString(),
      };
    });

    return {
      vendorId,
      closingBalance: balance.toString(),
      lines: rows,
      total: rows.length,
    };
  },

  /**
   * Accounts-payable aging — buckets outstanding (unpaid/partial) bill balances
   * by days past due as of `asOf` (defaults to now). When `vendorId` is given,
   * scoped to that vendor; otherwise summarizes across all vendors and also
   * returns the per-vendor breakdown.
   */
  async payableAging(
    tenantId: string,
    filters: { asOf?: string; vendorId?: string },
    paging: Paging,
  ) {
    if (filters.vendorId) {
      await this.get(tenantId, filters.vendorId); // 404 if not found
    }

    const asOf = parseOptionalDate(filters.asOf) ?? new Date();
    const [openBills, total] = await Promise.all([
      repo.listOpenBills(tenantId, { vendorId: filters.vendorId, skip: paging.skip, take: paging.take }),
      repo.countOpenBills(tenantId, { vendorId: filters.vendorId }),
    ]);

    const buckets = {
      current: new Prisma.Decimal(0), // not yet due
      d1_30: new Prisma.Decimal(0),
      d31_60: new Prisma.Decimal(0),
      d61_90: new Prisma.Decimal(0),
      d90_plus: new Prisma.Decimal(0),
    };

    const rows = openBills.map((b) => {
      const daysPastDue = Math.floor((asOf.getTime() - b.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      let bucket: keyof typeof buckets;
      if (daysPastDue <= 0) bucket = 'current';
      else if (daysPastDue <= 30) bucket = 'd1_30';
      else if (daysPastDue <= 60) bucket = 'd31_60';
      else if (daysPastDue <= 90) bucket = 'd61_90';
      else bucket = 'd90_plus';

      buckets[bucket] = buckets[bucket].plus(b.balanceDue);

      return {
        billId: b.id,
        vendorId: b.vendorId,
        number: b.number,
        dueDate: b.dueDate.toISOString(),
        daysPastDue,
        bucket,
        balanceDue: b.balanceDue.toString(),
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
