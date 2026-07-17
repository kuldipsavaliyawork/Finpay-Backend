import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { expenseCategoriesService, expensesService } from './expenses.service';
import { toExpenseCategoryApi, toExpenseApi } from './expenses.mapper';
import type {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  ListExpenseCategoryQuery,
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpenseQuery,
  RejectExpenseInput,
} from './expenses.dto';

export const expenseCategoriesController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListExpenseCategoryQuery;
    const [items, total] = await expenseCategoriesService.list(tenantId, paging, {
      q: query.q,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toExpenseCategoryApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const category = await expenseCategoriesService.get(tenantId, req.params.id as string);
    ok(res, toExpenseCategoryApi(category));
  },

  async create(req: Request, res: Response): Promise<void> {
    const category = await expenseCategoriesService.create(ctxOf(req), req.body as CreateExpenseCategoryInput);
    created(res, toExpenseCategoryApi(category));
  },

  async update(req: Request, res: Response): Promise<void> {
    const category = await expenseCategoriesService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateExpenseCategoryInput,
    );
    ok(res, toExpenseCategoryApi(category));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await expenseCategoriesService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};

export const expensesController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListExpenseQuery;
    const [items, total] = await expensesService.list(tenantId, paging, {
      q: query.q,
      status: query.status,
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      departmentId: query.departmentId,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toExpenseApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const expense = await expensesService.get(tenantId, req.params.id as string);
    ok(res, toExpenseApi(expense));
  },

  async create(req: Request, res: Response): Promise<void> {
    const expense = await expensesService.create(ctxOf(req), req.body as CreateExpenseInput);
    created(res, toExpenseApi(expense));
  },

  async update(req: Request, res: Response): Promise<void> {
    const expense = await expensesService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateExpenseInput,
    );
    ok(res, toExpenseApi(expense));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await expensesService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  async submit(req: Request, res: Response): Promise<void> {
    const expense = await expensesService.submit(ctxOf(req), req.params.id as string);
    ok(res, toExpenseApi(expense));
  },

  async approve(req: Request, res: Response): Promise<void> {
    const expense = await expensesService.approve(ctxOf(req), req.params.id as string);
    ok(res, toExpenseApi(expense));
  },

  async reject(req: Request, res: Response): Promise<void> {
    const body = req.body as RejectExpenseInput;
    const expense = await expensesService.reject(ctxOf(req), req.params.id as string, body.reason);
    ok(res, toExpenseApi(expense));
  },

  async reimburse(req: Request, res: Response): Promise<void> {
    const expense = await expensesService.markReimbursed(ctxOf(req), req.params.id as string);
    ok(res, toExpenseApi(expense));
  },
};
