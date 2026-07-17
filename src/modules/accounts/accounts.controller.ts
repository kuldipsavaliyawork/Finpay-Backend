import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { accountsService } from './accounts.service';
import { toAccountApi } from './accounts.mapper';
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountQuery,
  TreeQuery,
  BalanceQuery,
} from './accounts.dto';

export const accountsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListAccountQuery;
    const [items, total] = await accountsService.list(tenantId, paging, {
      q: query.q,
      type: query.type,
      isActive: query.isActive,
      parentId: query.parentId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toAccountApi), buildMeta(total, paging));
  },

  async tree(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as TreeQuery;
    const result = await accountsService.tree(tenantId, {
      type: query.type,
      includeInactive: query.includeInactive,
    });
    ok(res, result);
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const account = await accountsService.get(tenantId, req.params.id as string);
    ok(res, toAccountApi(account));
  },

  async balance(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as BalanceQuery;
    const result = await accountsService.balance(tenantId, req.params.id as string, { asOf: query.asOf });
    ok(res, result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const account = await accountsService.create(ctxOf(req), req.body as CreateAccountInput);
    created(res, toAccountApi(account));
  },

  async update(req: Request, res: Response): Promise<void> {
    const account = await accountsService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateAccountInput,
    );
    ok(res, toAccountApi(account));
  },

  async activate(req: Request, res: Response): Promise<void> {
    const account = await accountsService.setActive(ctxOf(req), req.params.id as string, true);
    ok(res, toAccountApi(account));
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const account = await accountsService.setActive(ctxOf(req), req.params.id as string, false);
    ok(res, toAccountApi(account));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await accountsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};
