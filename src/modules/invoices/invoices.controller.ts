import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { invoicesService } from './invoices.service';
import { toInvoiceApi, toInvoiceListApi } from './invoices.mapper';
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoiceQuery } from './invoices.dto';

export const invoicesController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListInvoiceQuery;
    const [items, total] = await invoicesService.list(tenantId, paging, {
      q: query.q,
      status: query.status,
      customerId: query.customerId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toInvoiceListApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const invoice = await invoicesService.get(tenantId, req.params.id as string);
    ok(res, toInvoiceApi(invoice));
  },

  async create(req: Request, res: Response): Promise<void> {
    const invoice = await invoicesService.create(ctxOf(req), req.body as CreateInvoiceInput);
    created(res, toInvoiceApi(invoice));
  },

  async update(req: Request, res: Response): Promise<void> {
    const invoice = await invoicesService.update(ctxOf(req), req.params.id as string, req.body as UpdateInvoiceInput);
    ok(res, toInvoiceApi(invoice));
  },

  async post(req: Request, res: Response): Promise<void> {
    const invoice = await invoicesService.post(ctxOf(req), req.params.id as string);
    ok(res, toInvoiceApi(invoice));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await invoicesService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};
