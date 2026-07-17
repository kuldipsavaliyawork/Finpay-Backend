import type { Request, Response } from 'express';
import { ok, created, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { depositAccountsService, transfersService } from './deposit-accounts.service';
import { toDepositAccountApi, toDepositTransactionApi, toTransferApi } from './deposit-accounts.mapper';
import type {
  OpenDepositAccountInput,
  UpdateDepositAccountInput,
  ListDepositAccountQuery,
  ListDepositTransactionQuery,
  CreateTransferInput,
  ListTransferQuery,
} from './deposit-accounts.dto';

export const depositAccountsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListDepositAccountQuery;
    const [items, total] = await depositAccountsService.list(tenantId, paging, {
      q: query.q,
      customerId: query.customerId,
      type: query.type,
      status: query.status,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toDepositAccountApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const account = await depositAccountsService.get(tenantId, req.params.id as string);
    ok(res, toDepositAccountApi(account));
  },

  async open(req: Request, res: Response): Promise<void> {
    const account = await depositAccountsService.open(ctxOf(req), req.body as OpenDepositAccountInput);
    created(res, toDepositAccountApi(account));
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const account = await depositAccountsService.updateStatus(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateDepositAccountInput,
    );
    ok(res, toDepositAccountApi(account));
  },

  async transactions(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListDepositTransactionQuery;
    const [items, total] = await depositAccountsService.listTransactions(tenantId, req.params.id as string, paging, {
      type: query.type,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toDepositTransactionApi), buildMeta(total, paging));
  },
};

export const transfersController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListTransferQuery;
    const [items, total] = await transfersService.list(tenantId, paging, {
      accountId: query.accountId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toTransferApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const transfer = await transfersService.get(tenantId, req.params.id as string);
    ok(res, toTransferApi(transfer));
  },

  async create(req: Request, res: Response): Promise<void> {
    const transfer = await transfersService.create(ctxOf(req), req.body as CreateTransferInput);
    created(res, toTransferApi(transfer));
  },
};
