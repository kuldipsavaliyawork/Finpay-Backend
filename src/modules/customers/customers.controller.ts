import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { customersService } from './customers.service';
import { toCustomerApi } from './customers.mapper';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomerQuery,
  StatementQuery,
  AgingQuery,
} from './customers.dto';

export const customersController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListCustomerQuery;
    const [items, total] = await customersService.list(tenantId, paging, {
      q: query.q,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toCustomerApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const customer = await customersService.get(tenantId, req.params.id as string);
    ok(res, toCustomerApi(customer));
  },

  async create(req: Request, res: Response): Promise<void> {
    const customer = await customersService.create(ctxOf(req), req.body as CreateCustomerInput);
    created(res, toCustomerApi(customer));
  },

  async update(req: Request, res: Response): Promise<void> {
    const customer = await customersService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateCustomerInput,
    );
    ok(res, toCustomerApi(customer));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await customersService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  async statement(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as StatementQuery;
    const result = await customersService.statement(tenantId, req.params.id as string, {
      from: query.from,
      to: query.to,
    });
    ok(res, result);
  },

  async outstandingBalance(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const result = await customersService.outstandingBalance(tenantId, req.params.id as string);
    ok(res, result);
  },

  async receivableAging(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as AgingQuery;
    const result = await customersService.receivableAging(
      tenantId,
      { asOf: query.asOf, customerId: query.customerId },
      paging,
    );
    const meta = { ...buildMeta(result.total, paging), asOf: result.asOf, summary: result.summary };
    paginated(res, result.rows, meta);
  },
};
