import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { organizationsService } from './organizations.service';
import {
  toTenantProfileApi,
  toTenantSettingsApi,
  toFinancialYearApi,
  toCurrencyApi,
  toDepartmentApi,
  toBranchApi,
} from './organizations.mapper';
import type {
  UpdateTenantProfileInput,
  UpdateTenantSettingsInput,
  CreateFinancialYearInput,
  UpdateFinancialYearInput,
  ListFinancialYearQuery,
  CreateCurrencyInput,
  UpdateCurrencyInput,
  ListCurrencyQuery,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  ListDepartmentQuery,
  CreateBranchInput,
  UpdateBranchInput,
  ListBranchQuery,
} from './organizations.dto';

export const organizationsController = {
  // ── Tenant profile ─────────────────────────────────────────────────────────
  async getProfile(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toTenantProfileApi(await organizationsService.getProfile(tenantId)));
  },

  async updateProfile(req: Request, res: Response): Promise<void> {
    const profile = await organizationsService.updateProfile(ctxOf(req), req.body as UpdateTenantProfileInput);
    ok(res, toTenantProfileApi(profile));
  },

  // ── Tenant settings ─────────────────────────────────────────────────────────
  async getSettings(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toTenantSettingsApi(await organizationsService.getSettings(tenantId)));
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const settings = await organizationsService.updateSettings(ctxOf(req), req.body as UpdateTenantSettingsInput);
    ok(res, toTenantSettingsApi(settings));
  },

  // ── Financial years ─────────────────────────────────────────────────────────────
  async listFinancialYears(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListFinancialYearQuery;
    const [items, total] = await organizationsService.listFinancialYears(tenantId, paging, {
      q: query.q,
      status: query.status,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toFinancialYearApi), buildMeta(total, paging));
  },

  async getFinancialYear(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toFinancialYearApi(await organizationsService.getFinancialYear(tenantId, req.params.id as string)));
  },

  async createFinancialYear(req: Request, res: Response): Promise<void> {
    const fy = await organizationsService.createFinancialYear(ctxOf(req), req.body as CreateFinancialYearInput);
    created(res, toFinancialYearApi(fy));
  },

  async updateFinancialYear(req: Request, res: Response): Promise<void> {
    const fy = await organizationsService.updateFinancialYear(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateFinancialYearInput,
    );
    ok(res, toFinancialYearApi(fy));
  },

  async removeFinancialYear(req: Request, res: Response): Promise<void> {
    await organizationsService.removeFinancialYear(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Currencies ───────────────────────────────────────────────────────────────
  async listCurrencies(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListCurrencyQuery;
    const [items, total] = await organizationsService.listCurrencies(tenantId, paging, {
      q: query.q,
      isBase: query.isBase,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toCurrencyApi), buildMeta(total, paging));
  },

  async getCurrency(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toCurrencyApi(await organizationsService.getCurrency(tenantId, req.params.id as string)));
  },

  async createCurrency(req: Request, res: Response): Promise<void> {
    const currency = await organizationsService.createCurrency(ctxOf(req), req.body as CreateCurrencyInput);
    created(res, toCurrencyApi(currency));
  },

  async updateCurrency(req: Request, res: Response): Promise<void> {
    const currency = await organizationsService.updateCurrency(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateCurrencyInput,
    );
    ok(res, toCurrencyApi(currency));
  },

  async removeCurrency(req: Request, res: Response): Promise<void> {
    await organizationsService.removeCurrency(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Departments ──────────────────────────────────────────────────────────────
  async listDepartments(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListDepartmentQuery;
    const [items, total] = await organizationsService.listDepartments(tenantId, paging, {
      q: query.q,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toDepartmentApi), buildMeta(total, paging));
  },

  async getDepartment(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toDepartmentApi(await organizationsService.getDepartment(tenantId, req.params.id as string)));
  },

  async createDepartment(req: Request, res: Response): Promise<void> {
    const dept = await organizationsService.createDepartment(ctxOf(req), req.body as CreateDepartmentInput);
    created(res, toDepartmentApi(dept));
  },

  async updateDepartment(req: Request, res: Response): Promise<void> {
    const dept = await organizationsService.updateDepartment(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateDepartmentInput,
    );
    ok(res, toDepartmentApi(dept));
  },

  async removeDepartment(req: Request, res: Response): Promise<void> {
    await organizationsService.removeDepartment(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Branches ─────────────────────────────────────────────────────────────────
  async listBranches(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBranchQuery;
    const [items, total] = await organizationsService.listBranches(tenantId, paging, {
      q: query.q,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toBranchApi), buildMeta(total, paging));
  },

  async getBranch(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, toBranchApi(await organizationsService.getBranch(tenantId, req.params.id as string)));
  },

  async createBranch(req: Request, res: Response): Promise<void> {
    const branch = await organizationsService.createBranch(ctxOf(req), req.body as CreateBranchInput);
    created(res, toBranchApi(branch));
  },

  async updateBranch(req: Request, res: Response): Promise<void> {
    const branch = await organizationsService.updateBranch(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateBranchInput,
    );
    ok(res, toBranchApi(branch));
  },

  async removeBranch(req: Request, res: Response): Promise<void> {
    await organizationsService.removeBranch(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};
