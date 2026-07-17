import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { parseOptionalDate, type Ctx } from '../../common/http';
import { taxRepository as repo } from './tax.repository';
import type {
  CreateTaxRateInput,
  UpdateTaxRateInput,
  CreateTaxGroupInput,
  UpdateTaxGroupInput,
} from './tax.dto';
import type { Paging } from '../../common/pagination/pagination';

const ZERO = new Prisma.Decimal(0);

export const taxService = {
  // ── Tax rates ────────────────────────────────────────────────────────────
  async listRates(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; kind?: 'output' | 'input'; isActive?: boolean; sortBy?: 'name' | 'rate' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listRates(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countRates(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getRate(tenantId: string, id: string) {
    const rate = await repo.findRateById(tenantId, id);
    if (!rate) throw new NotFoundError('Tax rate not found');
    return rate;
  },

  async createRate(ctx: Ctx, input: CreateTaxRateInput) {
    const dupe = await repo.findRateByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('A tax rate with this name already exists', { name: input.name });

    return prisma.$transaction(async (tx) => {
      const rate = await repo.createRate(
        ctx.tenantId,
        {
          name: input.name,
          rate: new Prisma.Decimal(input.rate),
          kind: input.kind ?? 'output',
          region: input.region ?? null,
          isActive: input.isActive ?? true,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'tax',
          entityType: 'tax_rate',
          entityId: rate.id,
          after: rate,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return rate;
    });
  },

  async updateRate(ctx: Ctx, id: string, input: UpdateTaxRateInput) {
    const before = await this.getRate(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await repo.findRateByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('A tax rate with this name already exists', { name: input.name });
      }
    }

    const data: Prisma.TaxRateUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.rate !== undefined) data.rate = new Prisma.Decimal(input.rate);
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.region !== undefined) data.region = input.region;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await repo.updateRate(ctx.tenantId, id, data);
    const after = await this.getRate(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'tax',
      entityType: 'tax_rate',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeRate(ctx: Ctx, id: string) {
    const before = await this.getRate(ctx.tenantId, id);
    // Tax rates are soft-deleted (deactivated) only, never purged, so
    // historical invoice/bill line items referencing them remain intact.
    await repo.softDeleteRate(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'tax',
      entityType: 'tax_rate',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Tax groups ───────────────────────────────────────────────────────────
  async listGroups(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; isActive?: boolean; sortBy?: 'name' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listGroups(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countGroups(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getGroup(tenantId: string, id: string) {
    const group = await repo.findGroupById(tenantId, id);
    if (!group) throw new NotFoundError('Tax group not found');
    return group;
  },

  async createGroup(ctx: Ctx, input: CreateTaxGroupInput) {
    const dupe = await repo.findGroupByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('A tax group with this name already exists', { name: input.name });

    const rateIds = input.rateIds ?? [];
    if (rateIds.length > 0) {
      const ok = await repo.ratesExist(ctx.tenantId, rateIds);
      if (!ok) throw new NotFoundError('One or more tax rates were not found');
    }

    const groupId = await prisma.$transaction(async (tx) => {
      const group = await repo.createGroup(ctx.tenantId, { name: input.name, isActive: input.isActive ?? true }, tx);
      if (rateIds.length > 0) {
        await repo.setGroupRates(ctx.tenantId, group.id, rateIds, tx);
      }
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'tax',
          entityType: 'tax_group',
          entityId: group.id,
          after: { ...group, rateIds },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return group.id;
    });

    return this.getGroup(ctx.tenantId, groupId);
  },

  async updateGroup(ctx: Ctx, id: string, input: UpdateTaxGroupInput) {
    const before = await this.getGroup(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await repo.findGroupByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('A tax group with this name already exists', { name: input.name });
      }
    }

    const data: Prisma.TaxGroupUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await repo.updateGroup(ctx.tenantId, id, data);
    const after = await this.getGroup(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'tax',
      entityType: 'tax_group',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeGroup(ctx: Ctx, id: string) {
    const before = await this.getGroup(ctx.tenantId, id);
    // TaxGroup has no soft-delete column in the schema — hard delete the
    // group row; TaxGroupRate link rows cascade, TaxRate rows are untouched.
    await repo.deleteGroup(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'tax',
      entityType: 'tax_group',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /** Replace the full set of rate links for a group. */
  async setGroupRates(ctx: Ctx, id: string, rateIds: string[]) {
    const before = await this.getGroup(ctx.tenantId, id);
    if (rateIds.length > 0) {
      const ok = await repo.ratesExist(ctx.tenantId, rateIds);
      if (!ok) throw new NotFoundError('One or more tax rates were not found');
    }

    await prisma.$transaction(async (tx) => {
      await repo.setGroupRates(ctx.tenantId, id, rateIds, tx);
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'tax',
          entityType: 'tax_group',
          entityId: id,
          before,
          after: { rateIds },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.getGroup(ctx.tenantId, id);
  },

  /** Link a single rate into a group (idempotent). */
  async addGroupRate(ctx: Ctx, id: string, rateId: string) {
    await this.getGroup(ctx.tenantId, id); // 404 if not found
    const rate = await repo.findRateById(ctx.tenantId, rateId);
    if (!rate) throw new NotFoundError('Tax rate not found');

    await prisma.$transaction(async (tx) => {
      await repo.addGroupRate(id, rateId, tx);
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'tax',
          entityType: 'tax_group',
          entityId: id,
          after: { linkedRateId: rateId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.getGroup(ctx.tenantId, id);
  },

  /** Unlink a single rate from a group. */
  async removeGroupRate(ctx: Ctx, id: string, rateId: string) {
    await this.getGroup(ctx.tenantId, id); // 404 if not found

    await prisma.$transaction(async (tx) => {
      await repo.removeGroupRate(id, rateId, tx);
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'tax',
          entityType: 'tax_group',
          entityId: id,
          after: { unlinkedRateId: rateId },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.getGroup(ctx.tenantId, id);
  },

  /**
   * Tax liability summary for a period: output tax (collected on posted
   * invoices) minus input tax (paid on posted bills), broken down by tax
   * rate. Derived directly from immutable InvoiceItem/BillItem rows on
   * posted (journalEntryId set) documents — the same source of truth the
   * ledger postings were built from — rather than re-deriving from
   * JournalLine, since output and input tax may share one GST-payable
   * account and would not be separable there.
   */
  async liabilitySummary(tenantId: string, filters: { from?: string; to?: string }) {
    if (filters.from && !parseOptionalDate(filters.from)) {
      throw new UnprocessableError('Invalid "from" date');
    }
    if (filters.to && !parseOptionalDate(filters.to)) {
      throw new UnprocessableError('Invalid "to" date');
    }
    const from = parseOptionalDate(filters.from);
    const to = parseOptionalDate(filters.to);

    const [outputItems, inputItems] = await Promise.all([
      repo.listOutputTaxItems(tenantId, { from, to }),
      repo.listInputTaxItems(tenantId, { from, to }),
    ]);

    const rateIds = new Set<string>();
    for (const it of outputItems) if (it.taxRateId) rateIds.add(it.taxRateId);
    for (const it of inputItems) if (it.taxRateId) rateIds.add(it.taxRateId);
    const rates = await repo.findRatesByIds(tenantId, [...rateIds]);
    const rateById = new Map(rates.map((r) => [r.id, r]));

    interface Bucket {
      taxRateId: string | null;
      name: string;
      rate: string | null;
      taxableAmount: Prisma.Decimal;
      outputTax: Prisma.Decimal;
      inputTax: Prisma.Decimal;
    }
    const buckets = new Map<string, Bucket>();
    const bucketKey = (id: string | null) => id ?? '__unassigned__';

    function bucketFor(id: string | null): Bucket {
      const key = bucketKey(id);
      let b = buckets.get(key);
      if (!b) {
        const r = id ? rateById.get(id) : undefined;
        b = {
          taxRateId: id,
          name: r?.name ?? 'Unassigned',
          rate: r ? r.rate.toString() : null,
          taxableAmount: ZERO,
          outputTax: ZERO,
          inputTax: ZERO,
        };
        buckets.set(key, b);
      }
      return b;
    }

    let totalOutputTax = ZERO;
    for (const it of outputItems) {
      const b = bucketFor(it.taxRateId);
      b.outputTax = b.outputTax.plus(it.taxAmount);
      b.taxableAmount = b.taxableAmount.plus(it.lineTotal);
      totalOutputTax = totalOutputTax.plus(it.taxAmount);
    }

    let totalInputTax = ZERO;
    for (const it of inputItems) {
      const b = bucketFor(it.taxRateId);
      b.inputTax = b.inputTax.plus(it.taxAmount);
      totalInputTax = totalInputTax.plus(it.taxAmount);
    }

    const rows = [...buckets.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({
        taxRateId: b.taxRateId,
        name: b.name,
        rate: b.rate,
        taxableAmount: b.taxableAmount.toString(),
        outputTax: b.outputTax.toString(),
        inputTax: b.inputTax.toString(),
        netTax: b.outputTax.minus(b.inputTax).toString(),
      }));

    return {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      summary: {
        outputTax: totalOutputTax.toString(),
        inputTax: totalInputTax.toString(),
        netTaxPayable: totalOutputTax.minus(totalInputTax).toString(),
      },
      rows,
    };
  },
};
