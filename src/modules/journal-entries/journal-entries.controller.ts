import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { journalEntriesService } from './journal-entries.service';
import { toJournalEntryApi, toJournalEntryListApi } from './journal-entries.mapper';
import type {
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
  ReverseJournalEntryInput,
  ListJournalEntryQuery,
  AccountHistoryQuery,
  TrialBalanceQuery,
} from './journal-entries.dto';

export const journalEntriesController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListJournalEntryQuery;
    const [items, total] = await journalEntriesService.list(tenantId, paging, {
      q: query.q,
      status: query.status,
      source: query.source,
      accountId: query.accountId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toJournalEntryListApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const entry = await journalEntriesService.get(tenantId, req.params.id as string);
    ok(res, toJournalEntryApi(entry));
  },

  async create(req: Request, res: Response): Promise<void> {
    const entry = await journalEntriesService.createDraft(ctxOf(req), req.body as CreateJournalEntryInput);
    created(res, toJournalEntryApi(entry));
  },

  async update(req: Request, res: Response): Promise<void> {
    const entry = await journalEntriesService.updateDraft(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateJournalEntryInput,
    );
    ok(res, toJournalEntryApi(entry));
  },

  async post(req: Request, res: Response): Promise<void> {
    const entry = await journalEntriesService.post(ctxOf(req), req.params.id as string);
    ok(res, toJournalEntryApi(entry));
  },

  async reverse(req: Request, res: Response): Promise<void> {
    const entry = await journalEntriesService.reverse(
      ctxOf(req),
      req.params.id as string,
      req.body as ReverseJournalEntryInput,
    );
    created(res, toJournalEntryApi(entry));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await journalEntriesService.removeDraft(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  async accountHistory(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as AccountHistoryQuery;
    const result = await journalEntriesService.accountHistory(tenantId, req.params.accountId as string, paging, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    paginated(res, result.rows, {
      ...buildMeta(result.total, paging),
    });
  },

  async trialBalance(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as TrialBalanceQuery;
    const result = await journalEntriesService.trialBalance(tenantId, { asOf: query.asOf });
    ok(res, result);
  },
};
