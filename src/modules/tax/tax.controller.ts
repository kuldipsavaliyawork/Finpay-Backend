import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { taxService } from './tax.service';
import { toTaxRateApi, toTaxGroupApi } from './tax.mapper';
import type {
  CreateTaxRateInput,
  UpdateTaxRateInput,
  ListTaxRateQuery,
  CreateTaxGroupInput,
  UpdateTaxGroupInput,
  ListTaxGroupQuery,
  SetGroupRatesInput,
  TaxLiabilityQuery,
} from './tax.dto';

export const taxController = {
  // ── Tax rates ────────────────────────────────────────────────────────────
  async listRates(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListTaxRateQuery;
    const [items, total] = await taxService.listRates(tenantId, paging, {
      q: query.q,
      kind: query.kind,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toTaxRateApi), buildMeta(total, paging));
  },

  async getRate(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const rate = await taxService.getRate(tenantId, req.params.id as string);
    ok(res, toTaxRateApi(rate));
  },

  async createRate(req: Request, res: Response): Promise<void> {
    const rate = await taxService.createRate(ctxOf(req), req.body as CreateTaxRateInput);
    created(res, toTaxRateApi(rate));
  },

  async updateRate(req: Request, res: Response): Promise<void> {
    const rate = await taxService.updateRate(ctxOf(req), req.params.id as string, req.body as UpdateTaxRateInput);
    ok(res, toTaxRateApi(rate));
  },

  async removeRate(req: Request, res: Response): Promise<void> {
    await taxService.removeRate(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Tax groups ───────────────────────────────────────────────────────────
  async listGroups(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListTaxGroupQuery;
    const [items, total] = await taxService.listGroups(tenantId, paging, {
      q: query.q,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toTaxGroupApi), buildMeta(total, paging));
  },

  async getGroup(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const group = await taxService.getGroup(tenantId, req.params.id as string);
    ok(res, toTaxGroupApi(group));
  },

  async createGroup(req: Request, res: Response): Promise<void> {
    const group = await taxService.createGroup(ctxOf(req), req.body as CreateTaxGroupInput);
    created(res, toTaxGroupApi(group));
  },

  async updateGroup(req: Request, res: Response): Promise<void> {
    const group = await taxService.updateGroup(ctxOf(req), req.params.id as string, req.body as UpdateTaxGroupInput);
    ok(res, toTaxGroupApi(group));
  },

  async removeGroup(req: Request, res: Response): Promise<void> {
    await taxService.removeGroup(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  async setGroupRates(req: Request, res: Response): Promise<void> {
    const { rateIds } = req.body as SetGroupRatesInput;
    const group = await taxService.setGroupRates(ctxOf(req), req.params.id as string, rateIds);
    ok(res, toTaxGroupApi(group));
  },

  async addGroupRate(req: Request, res: Response): Promise<void> {
    const group = await taxService.addGroupRate(ctxOf(req), req.params.id as string, req.params.rateId as string);
    created(res, toTaxGroupApi(group));
  },

  async removeGroupRate(req: Request, res: Response): Promise<void> {
    const group = await taxService.removeGroupRate(ctxOf(req), req.params.id as string, req.params.rateId as string);
    ok(res, toTaxGroupApi(group));
  },

  // ── Tax liability summary ───────────────────────────────────────────────
  async liabilitySummary(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as TaxLiabilityQuery;
    const result = await taxService.liabilitySummary(tenantId, { from: query.from, to: query.to });
    ok(res, result);
  },
};
