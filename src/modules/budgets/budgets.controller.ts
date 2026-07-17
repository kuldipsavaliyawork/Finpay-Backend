import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { budgetsService } from './budgets.service';
import { toBudgetApi, toBudgetWithLinesApi, toBudgetLineApi } from './budgets.mapper';
import type {
  CreateBudgetInput,
  UpdateBudgetInput,
  ListBudgetQuery,
  BudgetLineInput,
  UpdateBudgetLineInput,
  ListBudgetLineQuery,
  VarianceQuery,
} from './budgets.dto';

export const budgetsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBudgetQuery;
    const [items, total] = await budgetsService.list(tenantId, paging, {
      q: query.q,
      financialYear: query.financialYear,
      status: query.status,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toBudgetApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const budget = await budgetsService.getWithLines(tenantId, req.params.id as string);
    ok(res, toBudgetWithLinesApi(budget));
  },

  async create(req: Request, res: Response): Promise<void> {
    const budget = await budgetsService.create(ctxOf(req), req.body as CreateBudgetInput);
    created(res, toBudgetApi(budget));
  },

  async update(req: Request, res: Response): Promise<void> {
    const budget = await budgetsService.update(ctxOf(req), req.params.id as string, req.body as UpdateBudgetInput);
    ok(res, toBudgetApi(budget));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await budgetsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Budget lines ──────────────────────────────────────────────────────────
  async listLines(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBudgetLineQuery;
    const [items, total] = await budgetsService.listLines(tenantId, req.params.id as string, paging, {
      accountId: query.accountId,
      period: query.period,
    });
    paginated(res, items.map(toBudgetLineApi), buildMeta(total, paging));
  },

  async getLine(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const line = await budgetsService.getLine(tenantId, req.params.id as string, req.params.lineId as string);
    ok(res, toBudgetLineApi(line));
  },

  async createLine(req: Request, res: Response): Promise<void> {
    const line = await budgetsService.createLine(ctxOf(req), req.params.id as string, req.body as BudgetLineInput);
    created(res, toBudgetLineApi(line));
  },

  async updateLine(req: Request, res: Response): Promise<void> {
    const line = await budgetsService.updateLine(
      ctxOf(req),
      req.params.id as string,
      req.params.lineId as string,
      req.body as UpdateBudgetLineInput,
    );
    ok(res, toBudgetLineApi(line));
  },

  async removeLine(req: Request, res: Response): Promise<void> {
    await budgetsService.removeLine(ctxOf(req), req.params.id as string, req.params.lineId as string);
    noContent(res);
  },

  // ── Budget vs actual ────────────────────────────────────────────────────
  async variance(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as VarianceQuery;
    const result = await budgetsService.varianceReport(
      tenantId,
      req.params.id as string,
      { from: query.from, to: query.to, accountId: query.accountId },
      paging,
    );
    const meta = { ...buildMeta(result.total, paging), financialYear: result.financialYear, summary: result.summary };
    paginated(res, result.rows, meta);
  },
};
