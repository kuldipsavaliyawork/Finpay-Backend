import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { bankAccountsService, bankTransactionsService, reconciliationsService } from './banking.service';
import { toBankAccountApi, toBankTransactionApi, toReconciliationApi } from './banking.mapper';
import type {
  CreateBankAccountInput,
  UpdateBankAccountInput,
  ListBankAccountQuery,
  ListBankTransactionQuery,
  ImportCsvInput,
  MatchTransactionInput,
  CreateReconciliationInput,
  ListReconciliationQuery,
} from './banking.dto';

export const bankAccountsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBankAccountQuery;
    const [items, total] = await bankAccountsService.list(tenantId, paging, {
      q: query.q,
      type: query.type,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toBankAccountApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const bankAccount = await bankAccountsService.get(tenantId, req.params.id as string);
    ok(res, toBankAccountApi(bankAccount));
  },

  async create(req: Request, res: Response): Promise<void> {
    const bankAccount = await bankAccountsService.create(ctxOf(req), req.body as CreateBankAccountInput);
    created(res, toBankAccountApi(bankAccount));
  },

  async update(req: Request, res: Response): Promise<void> {
    const bankAccount = await bankAccountsService.update(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateBankAccountInput,
    );
    ok(res, toBankAccountApi(bankAccount));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await bankAccountsService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },
};

export const bankTransactionsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListBankTransactionQuery;
    const [items, total] = await bankTransactionsService.list(tenantId, paging, {
      q: query.q,
      bankAccountId: query.bankAccountId,
      status: query.status,
      type: query.type,
      from: query.from,
      to: query.to,
      importBatchId: query.importBatchId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toBankTransactionApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const txn = await bankTransactionsService.get(tenantId, req.params.id as string);
    ok(res, toBankTransactionApi(txn));
  },

  async importCsv(req: Request, res: Response): Promise<void> {
    const body = req.body as ImportCsvInput;
    const result = await bankTransactionsService.importCsv(ctxOf(req), body.bankAccountId, body.csv);
    created(res, {
      importBatchId: result.importBatchId,
      imported: result.imported,
      items: result.items.map(toBankTransactionApi),
    });
  },

  async match(req: Request, res: Response): Promise<void> {
    const txn = await bankTransactionsService.match(
      ctxOf(req),
      req.params.id as string,
      req.body as MatchTransactionInput,
    );
    ok(res, toBankTransactionApi(txn));
  },

  async unmatch(req: Request, res: Response): Promise<void> {
    const txn = await bankTransactionsService.unmatch(ctxOf(req), req.params.id as string);
    ok(res, toBankTransactionApi(txn));
  },
};

export const reconciliationsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListReconciliationQuery;
    const [items, total] = await reconciliationsService.list(tenantId, paging, {
      bankAccountId: query.bankAccountId,
      status: query.status,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toReconciliationApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const reconciliation = await reconciliationsService.get(tenantId, req.params.id as string);
    ok(res, toReconciliationApi(reconciliation));
  },

  async create(req: Request, res: Response): Promise<void> {
    const reconciliation = await reconciliationsService.create(ctxOf(req), req.body as CreateReconciliationInput);
    created(res, toReconciliationApi(reconciliation));
  },

  async complete(req: Request, res: Response): Promise<void> {
    const reconciliation = await reconciliationsService.complete(ctxOf(req), req.params.id as string);
    ok(res, toReconciliationApi(reconciliation));
  },
};
