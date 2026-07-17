import type { Request, Response } from 'express';
import { ok, created, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { approvalsService } from './approvals.service';
import { toApprovalRequestApi } from './approvals.mapper';
import type {
  CreateApprovalRequestInput,
  ListApprovalRequestQuery,
  ListPendingQuery,
  ActOnStepInput,
  RejectStepInput,
} from './approvals.dto';

export const approvalsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListApprovalRequestQuery;
    const [items, total] = await approvalsService.list(tenantId, paging, {
      status: query.status,
      entityType: query.entityType,
      requestedBy: query.requestedBy,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toApprovalRequestApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const request = await approvalsService.get(tenantId, req.params.id as string);
    ok(res, toApprovalRequestApi(request));
  },

  /** Approval requests currently awaiting action from the authenticated user. */
  async listPending(req: Request, res: Response): Promise<void> {
    const { tenantId, userId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListPendingQuery;
    const [items, total] = await approvalsService.listPendingForApprover(tenantId, userId, paging, {
      entityType: query.entityType,
    });
    paginated(res, items.map(toApprovalRequestApi), buildMeta(total, paging));
  },

  async create(req: Request, res: Response): Promise<void> {
    const request = await approvalsService.create(ctxOf(req), req.body as CreateApprovalRequestInput);
    created(res, toApprovalRequestApi(request));
  },

  async approveStep(req: Request, res: Response): Promise<void> {
    const { comment } = req.body as ActOnStepInput;
    const request = await approvalsService.approveStep(
      ctxOf(req),
      req.params.id as string,
      req.params.stepId as string,
      comment,
    );
    ok(res, toApprovalRequestApi(request));
  },

  async rejectStep(req: Request, res: Response): Promise<void> {
    const { comment } = req.body as RejectStepInput;
    const request = await approvalsService.rejectStep(
      ctxOf(req),
      req.params.id as string,
      req.params.stepId as string,
      comment,
    );
    ok(res, toApprovalRequestApi(request));
  },

  /** Approval history (steps) for a given entity, e.g. GET /approvals/history/invoice/:entityId */
  async historyForEntity(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const entityType = req.params.entityType as 'invoice' | 'bill' | 'expense' | 'journal';
    const entityId = req.params.entityId as string;
    const [request, total] = await approvalsService.historyForEntity(tenantId, entityType, entityId, paging);
    paginated(res, [toApprovalRequestApi(request)][0]!.steps, buildMeta(total, paging));
  },
};
