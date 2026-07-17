import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { vendorsService } from './vendors.service';
import { toVendorApi } from './vendors.mapper';
import type {
  CreateVendorInput,
  UpdateVendorInput,
  ListVendorQuery,
  StatementQuery,
  AgingQuery,
} from './vendors.dto';

export const vendorsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListVendorQuery;
    const [items, total] = await vendorsService.list(tenantId, paging, {
      q: query.q,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toVendorApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const vendor = await vendorsService.get(tenantId, req.params.id as string);
    ok(res, toVendorApi(vendor));
  },

  async create(req: Request, res: Response): Promise<void> {
    const vendor = await vendorsService.create(ctxOf(req), req.body as CreateVendorInput);
    created(res, toVendorApi(vendor));
  },

  async update(req: Request, res: Response): Promise<void> {
    const vendor = await vendorsService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateVendorInput,
    );
    ok(res, toVendorApi(vendor));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await vendorsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  async statement(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as StatementQuery;
    const result = await vendorsService.statement(tenantId, req.params.id as string, {
      from: query.from,
      to: query.to,
    });
    ok(res, result);
  },

  async payableAging(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as AgingQuery;
    const result = await vendorsService.payableAging(
      tenantId,
      { asOf: query.asOf, vendorId: query.vendorId },
      paging,
    );
    const meta = { ...buildMeta(result.total, paging), asOf: result.asOf, summary: result.summary };
    paginated(res, result.rows, meta);
  },
};
