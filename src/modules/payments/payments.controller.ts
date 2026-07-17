import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { paymentsService } from './payments.service';
import { toPaymentApi, toPaymentListApi } from './payments.mapper';
import type { CreatePaymentInput, ListPaymentQuery } from './payments.dto';

export const paymentsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListPaymentQuery;
    const [items, total] = await paymentsService.list(tenantId, paging, {
      q: query.q,
      direction: query.direction,
      status: query.status,
      customerId: query.customerId,
      vendorId: query.vendorId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toPaymentListApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const payment = await paymentsService.get(tenantId, req.params.id as string);
    ok(res, toPaymentApi(payment));
  },

  async create(req: Request, res: Response): Promise<void> {
    const payment = await paymentsService.create(ctxOf(req), req.body as CreatePaymentInput);
    created(res, toPaymentApi(payment));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await paymentsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};
