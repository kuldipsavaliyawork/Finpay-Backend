import {
  Prisma,
  type PrismaClient,
  type Tenant,
  type TenantSettings,
  type FinancialYear,
  type Currency,
  type Department,
  type Branch,
} from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListArgs {
  skip: number;
  take: number;
  q?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Organizations repository — all Prisma access for tenant profile/settings,
 * financial years, currencies, departments, and branches. ALWAYS tenant-scoped
 * (Tenant itself is scoped by its own `id`, everything else by `tenantId`).
 */
export const organizationsRepository = {
  // ── Tenant profile ─────────────────────────────────────────────────────────
  findTenantById(tenantId: string, db: Db = prisma): Promise<Tenant | null> {
    return db.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  },

  updateTenant(tenantId: string, data: Prisma.TenantUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.tenant.updateMany({ where: { id: tenantId, deletedAt: null }, data });
  },

  // ── Tenant settings (singleton per tenant) ─────────────────────────────────
  findSettings(tenantId: string, db: Db = prisma): Promise<TenantSettings | null> {
    return db.tenantSettings.findFirst({ where: { tenantId } });
  },

  createSettings(
    tenantId: string,
    data: Omit<Prisma.TenantSettingsUncheckedCreateInput, 'tenantId'> = {},
    db: Db = prisma,
  ): Promise<TenantSettings> {
    return db.tenantSettings.create({ data: { ...data, tenantId } });
  },

  updateSettings(
    tenantId: string,
    data: Prisma.TenantSettingsUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.tenantSettings.updateMany({ where: { tenantId }, data });
  },

  // ── Financial years ────────────────────────────────────────────────────────────
  findFinancialYearById(tenantId: string, id: string, db: Db = prisma): Promise<FinancialYear | null> {
    return db.financialYear.findFirst({ where: { id, tenantId } });
  },

  findFinancialYearByName(tenantId: string, name: string, db: Db = prisma): Promise<FinancialYear | null> {
    return db.financialYear.findFirst({ where: { tenantId, name } });
  },

  listFinancialYears(
    tenantId: string,
    a: ListArgs & { status?: string },
    db: Db = prisma,
  ): Promise<FinancialYear[]> {
    const where: Prisma.FinancialYearWhereInput = { tenantId };
    if (a.status) where.status = a.status;
    if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
    return db.financialYear.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'startDate']: a.sortDir ?? 'desc' },
    });
  },

  countFinancialYears(tenantId: string, a: { q?: string; status?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.FinancialYearWhereInput = { tenantId };
    if (a.status) where.status = a.status;
    if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
    return db.financialYear.count({ where });
  },

  createFinancialYear(
    tenantId: string,
    data: Omit<Prisma.FinancialYearUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<FinancialYear> {
    return db.financialYear.create({ data: { ...data, tenantId } });
  },

  updateFinancialYear(
    tenantId: string,
    id: string,
    data: Prisma.FinancialYearUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.financialYear.updateMany({ where: { id, tenantId }, data });
  },

  deleteFinancialYear(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.financialYear.deleteMany({ where: { id, tenantId } });
  },

  // ── Currencies ───────────────────────────────────────────────────────────────
  findCurrencyById(tenantId: string, id: string, db: Db = prisma): Promise<Currency | null> {
    return db.currency.findFirst({ where: { id, tenantId } });
  },

  findCurrencyByCode(tenantId: string, code: string, db: Db = prisma): Promise<Currency | null> {
    return db.currency.findFirst({ where: { tenantId, code } });
  },

  listCurrencies(
    tenantId: string,
    a: ListArgs & { isBase?: boolean },
    db: Db = prisma,
  ): Promise<Currency[]> {
    const where: Prisma.CurrencyWhereInput = { tenantId };
    if (a.isBase !== undefined) where.isBase = a.isBase;
    if (a.q) {
      where.OR = [
        { code: { contains: a.q, mode: 'insensitive' } },
        { name: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.currency.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'code']: a.sortDir ?? 'asc' },
    });
  },

  countCurrencies(tenantId: string, a: { q?: string; isBase?: boolean }, db: Db = prisma): Promise<number> {
    const where: Prisma.CurrencyWhereInput = { tenantId };
    if (a.isBase !== undefined) where.isBase = a.isBase;
    if (a.q) {
      where.OR = [
        { code: { contains: a.q, mode: 'insensitive' } },
        { name: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.currency.count({ where });
  },

  createCurrency(
    tenantId: string,
    data: Omit<Prisma.CurrencyUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Currency> {
    return db.currency.create({ data: { ...data, tenantId } });
  },

  updateCurrency(
    tenantId: string,
    id: string,
    data: Prisma.CurrencyUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.currency.updateMany({ where: { id, tenantId }, data });
  },

  /** Clear isBase on every currency for the tenant except `exceptId` (keeps a single base currency). */
  clearBaseExcept(tenantId: string, exceptId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.currency.updateMany({
      where: { tenantId, id: { not: exceptId }, isBase: true },
      data: { isBase: false },
    });
  },

  deleteCurrency(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.currency.deleteMany({ where: { id, tenantId } });
  },

  // ── Departments ──────────────────────────────────────────────────────────────
  findDepartmentById(tenantId: string, id: string, db: Db = prisma): Promise<Department | null> {
    return db.department.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  listDepartments(tenantId: string, a: ListArgs, db: Db = prisma): Promise<Department[]> {
    const where: Prisma.DepartmentWhereInput = { tenantId, deletedAt: null };
    if (a.q) {
      where.OR = [
        { name: { contains: a.q, mode: 'insensitive' } },
        { code: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.department.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  countDepartments(tenantId: string, a: { q?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.DepartmentWhereInput = { tenantId, deletedAt: null };
    if (a.q) {
      where.OR = [
        { name: { contains: a.q, mode: 'insensitive' } },
        { code: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.department.count({ where });
  },

  createDepartment(
    tenantId: string,
    data: Omit<Prisma.DepartmentUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Department> {
    return db.department.create({ data: { ...data, tenantId } });
  },

  updateDepartment(
    tenantId: string,
    id: string,
    data: Prisma.DepartmentUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.department.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDeleteDepartment(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.department.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },

  // ── Branches ─────────────────────────────────────────────────────────────────
  findBranchById(tenantId: string, id: string, db: Db = prisma): Promise<Branch | null> {
    return db.branch.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  listBranches(tenantId: string, a: ListArgs, db: Db = prisma): Promise<Branch[]> {
    const where: Prisma.BranchWhereInput = { tenantId, deletedAt: null };
    if (a.q) {
      where.OR = [
        { name: { contains: a.q, mode: 'insensitive' } },
        { code: { contains: a.q, mode: 'insensitive' } },
        { city: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.branch.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  countBranches(tenantId: string, a: { q?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.BranchWhereInput = { tenantId, deletedAt: null };
    if (a.q) {
      where.OR = [
        { name: { contains: a.q, mode: 'insensitive' } },
        { code: { contains: a.q, mode: 'insensitive' } },
        { city: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.branch.count({ where });
  },

  createBranch(
    tenantId: string,
    data: Omit<Prisma.BranchUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Branch> {
    return db.branch.create({ data: { ...data, tenantId } });
  },

  updateBranch(
    tenantId: string,
    id: string,
    data: Prisma.BranchUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.branch.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },

  softDeleteBranch(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.branch.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
