import { prisma, Prisma } from '../../infrastructure/prisma';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { requireDate, type Ctx } from '../../common/http';
import { organizationsRepository as repo } from './organizations.repository';
import type {
  UpdateTenantProfileInput,
  UpdateTenantSettingsInput,
  CreateFinancialYearInput,
  UpdateFinancialYearInput,
  CreateCurrencyInput,
  UpdateCurrencyInput,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  CreateBranchInput,
  UpdateBranchInput,
} from './organizations.dto';
import type { Paging } from '../../common/pagination/pagination';

export const organizationsService = {
  // ── Tenant profile ─────────────────────────────────────────────────────────
  async getProfile(tenantId: string) {
    const tenant = await repo.findTenantById(tenantId);
    if (!tenant) throw new NotFoundError('Organization not found');
    return tenant;
  },

  async updateProfile(ctx: Ctx, input: UpdateTenantProfileInput) {
    const before = await this.getProfile(ctx.tenantId);

    const data: Prisma.TenantUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.legalName !== undefined) data.legalName = input.legalName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.taxId !== undefined) data.taxId = input.taxId;
    if (input.baseCurrency !== undefined) data.baseCurrency = input.baseCurrency;
    if (input.country !== undefined) data.country = input.country;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;

    await repo.updateTenant(ctx.tenantId, data);
    const after = await this.getProfile(ctx.tenantId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'tenant',
      entityId: ctx.tenantId,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  // ── Tenant settings (singleton; lazily created on first read) ───────────────
  async getSettings(tenantId: string) {
    const existing = await repo.findSettings(tenantId);
    if (existing) return existing;
    // Singleton semantics: create the default row on first access rather than 404ing,
    // since TenantSettings has no meaningful "doesn't exist yet" state for callers.
    return repo.createSettings(tenantId);
  },

  async updateSettings(ctx: Ctx, input: UpdateTenantSettingsInput) {
    const before = await this.getSettings(ctx.tenantId);

    const data: Prisma.TenantSettingsUpdateInput = {};
    if (input.invoicePrefix !== undefined) data.invoicePrefix = input.invoicePrefix;
    if (input.invoiceNextNumber !== undefined) data.invoiceNextNumber = input.invoiceNextNumber;
    if (input.billPrefix !== undefined) data.billPrefix = input.billPrefix;
    if (input.billNextNumber !== undefined) data.billNextNumber = input.billNextNumber;
    if (input.journalPrefix !== undefined) data.journalPrefix = input.journalPrefix;
    if (input.journalNextNumber !== undefined) data.journalNextNumber = input.journalNextNumber;
    if (input.paymentPrefix !== undefined) data.paymentPrefix = input.paymentPrefix;
    if (input.paymentNextNumber !== undefined) data.paymentNextNumber = input.paymentNextNumber;
    if (input.passwordPolicy !== undefined) data.passwordPolicy = input.passwordPolicy;
    if (input.lockoutThreshold !== undefined) data.lockoutThreshold = input.lockoutThreshold;
    if (input.lockoutMinutes !== undefined) data.lockoutMinutes = input.lockoutMinutes;

    await repo.updateSettings(ctx.tenantId, data);
    const after = await this.getSettings(ctx.tenantId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'tenant_settings',
      entityId: after.id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  // ── Financial years ─────────────────────────────────────────────────────────────
  async listFinancialYears(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; status?: 'open' | 'closed'; sortBy?: string; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listFinancialYears(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countFinancialYears(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getFinancialYear(tenantId: string, id: string) {
    const fy = await repo.findFinancialYearById(tenantId, id);
    if (!fy) throw new NotFoundError('Financial year not found');
    return fy;
  },

  async createFinancialYear(ctx: Ctx, input: CreateFinancialYearInput) {
    const dupe = await repo.findFinancialYearByName(ctx.tenantId, input.name);
    if (dupe) throw new ConflictError('A financial year with this name already exists', { name: input.name });

    return prisma.$transaction(async (tx) => {
      const fy = await repo.createFinancialYear(
        ctx.tenantId,
        {
          name: input.name,
          startDate: requireDate(input.startDate),
          endDate: requireDate(input.endDate),
          status: input.status ?? 'open',
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'organizations',
          entityType: 'financial_year',
          entityId: fy.id,
          after: fy,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return fy;
    });
  },

  async updateFinancialYear(ctx: Ctx, id: string, input: UpdateFinancialYearInput) {
    const before = await this.getFinancialYear(ctx.tenantId, id);

    if (input.name && input.name !== before.name) {
      const dupe = await repo.findFinancialYearByName(ctx.tenantId, input.name);
      if (dupe && dupe.id !== id) {
        throw new ConflictError('A financial year with this name already exists', { name: input.name });
      }
    }

    const data: Prisma.FinancialYearUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.startDate !== undefined) data.startDate = requireDate(input.startDate);
    if (input.endDate !== undefined) data.endDate = requireDate(input.endDate);
    if (input.status !== undefined) data.status = input.status;

    await repo.updateFinancialYear(ctx.tenantId, id, data);
    const after = await this.getFinancialYear(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'financial_year',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeFinancialYear(ctx: Ctx, id: string) {
    const before = await this.getFinancialYear(ctx.tenantId, id);
    await repo.deleteFinancialYear(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'organizations',
      entityType: 'financial_year',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Currencies ───────────────────────────────────────────────────────────────
  async listCurrencies(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; isBase?: boolean; sortBy?: string; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.listCurrencies(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countCurrencies(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getCurrency(tenantId: string, id: string) {
    const c = await repo.findCurrencyById(tenantId, id);
    if (!c) throw new NotFoundError('Currency not found');
    return c;
  },

  async createCurrency(ctx: Ctx, input: CreateCurrencyInput) {
    const dupe = await repo.findCurrencyByCode(ctx.tenantId, input.code);
    if (dupe) throw new ConflictError('A currency with this code already exists', { code: input.code });

    return prisma.$transaction(async (tx) => {
      const currency = await repo.createCurrency(
        ctx.tenantId,
        {
          code: input.code,
          name: input.name,
          symbol: input.symbol,
          rate: new Prisma.Decimal(input.rate ?? 1),
          isBase: input.isBase ?? false,
        },
        tx,
      );
      if (currency.isBase) {
        await repo.clearBaseExcept(ctx.tenantId, currency.id, tx);
      }
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'organizations',
          entityType: 'currency',
          entityId: currency.id,
          after: currency,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return currency;
    });
  },

  async updateCurrency(ctx: Ctx, id: string, input: UpdateCurrencyInput) {
    const before = await this.getCurrency(ctx.tenantId, id);

    const data: Prisma.CurrencyUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.symbol !== undefined) data.symbol = input.symbol;
    if (input.rate !== undefined) data.rate = new Prisma.Decimal(input.rate);
    if (input.isBase !== undefined) data.isBase = input.isBase;

    await prisma.$transaction(async (tx) => {
      await repo.updateCurrency(ctx.tenantId, id, data, tx);
      if (input.isBase === true) {
        await repo.clearBaseExcept(ctx.tenantId, id, tx);
      }
    });
    const after = await this.getCurrency(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'currency',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeCurrency(ctx: Ctx, id: string) {
    const before = await this.getCurrency(ctx.tenantId, id);
    if (before.isBase) {
      throw new UnprocessableError('Cannot delete the base currency');
    }
    await repo.deleteCurrency(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'organizations',
      entityType: 'currency',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Departments ──────────────────────────────────────────────────────────────
  async listDepartments(tenantId: string, paging: Paging, filters: { q?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) {
    const [items, total] = await Promise.all([
      repo.listDepartments(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countDepartments(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getDepartment(tenantId: string, id: string) {
    const d = await repo.findDepartmentById(tenantId, id);
    if (!d) throw new NotFoundError('Department not found');
    return d;
  },

  async createDepartment(ctx: Ctx, input: CreateDepartmentInput) {
    return prisma.$transaction(async (tx) => {
      const dept = await repo.createDepartment(
        ctx.tenantId,
        {
          name: input.name,
          code: input.code ?? null,
          managerId: input.managerId ?? null,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'organizations',
          entityType: 'department',
          entityId: dept.id,
          after: dept,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return dept;
    });
  },

  async updateDepartment(ctx: Ctx, id: string, input: UpdateDepartmentInput) {
    const before = await this.getDepartment(ctx.tenantId, id);

    const data: Prisma.DepartmentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code;
    if (input.managerId !== undefined) data.managerId = input.managerId;

    await repo.updateDepartment(ctx.tenantId, id, data);
    const after = await this.getDepartment(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'department',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeDepartment(ctx: Ctx, id: string) {
    const before = await this.getDepartment(ctx.tenantId, id);
    await repo.softDeleteDepartment(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'organizations',
      entityType: 'department',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Branches ─────────────────────────────────────────────────────────────────
  async listBranches(tenantId: string, paging: Paging, filters: { q?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) {
    const [items, total] = await Promise.all([
      repo.listBranches(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countBranches(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async getBranch(tenantId: string, id: string) {
    const b = await repo.findBranchById(tenantId, id);
    if (!b) throw new NotFoundError('Branch not found');
    return b;
  },

  async createBranch(ctx: Ctx, input: CreateBranchInput) {
    return prisma.$transaction(async (tx) => {
      const branch = await repo.createBranch(
        ctx.tenantId,
        {
          name: input.name,
          code: input.code ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          country: input.country ?? null,
        },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'organizations',
          entityType: 'branch',
          entityId: branch.id,
          after: branch,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return branch;
    });
  },

  async updateBranch(ctx: Ctx, id: string, input: UpdateBranchInput) {
    const before = await this.getBranch(ctx.tenantId, id);

    const data: Prisma.BranchUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code;
    if (input.address !== undefined) data.address = input.address;
    if (input.city !== undefined) data.city = input.city;
    if (input.country !== undefined) data.country = input.country;

    await repo.updateBranch(ctx.tenantId, id, data);
    const after = await this.getBranch(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'organizations',
      entityType: 'branch',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async removeBranch(ctx: Ctx, id: string) {
    const before = await this.getBranch(ctx.tenantId, id);
    await repo.softDeleteBranch(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'organizations',
      entityType: 'branch',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },
};
