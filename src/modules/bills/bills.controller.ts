import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { billsService } from './bills.service';
import { toBillApi, toBillListApi } from './bills.mapper';
import type { CreateBillInput, UpdateBillInput, ListBillQuery, CancelBillInput } from './bills.dto';

export const billsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBillQuery;
    const [items, total] = await billsService.list(tenantId, paging, {
      q: query.q,
      status: query.status,
      vendorId: query.vendorId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toBillListApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const bill = await billsService.get(tenantId, req.params.id as string);
    ok(res, toBillApi(bill));
  },

  async create(req: Request, res: Response): Promise<void> {
    const bill = await billsService.create(ctxOf(req), req.body as CreateBillInput);
    created(res, toBillApi(bill));
  },

  async update(req: Request, res: Response): Promise<void> {
    const bill = await billsService.update(ctxOf(req), req.params.id as string, req.body as UpdateBillInput);
    ok(res, toBillApi(bill));
  },

  async submit(req: Request, res: Response): Promise<void> {
    const bill = await billsService.submit(ctxOf(req), req.params.id as string);
    ok(res, toBillApi(bill));
  },

  async approve(req: Request, res: Response): Promise<void> {
    const bill = await billsService.approve(ctxOf(req), req.params.id as string);
    ok(res, toBillApi(bill));
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const { reason } = req.body as CancelBillInput;
    const bill = await billsService.cancel(ctxOf(req), req.params.id as string, reason);
    ok(res, toBillApi(bill));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await billsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};
