import type { Request, Response } from 'express';
import { ok, paginated } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { auditService } from './audit.service';
import { toAuditSummaryApi, toAuditDetailApi } from './audit.mapper';
import type { ListAuditQuery, ExportAuditQuery } from './audit.dto';

export const auditController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListAuditQuery;
    const [items, total] = await auditService.list(tenantId, paging, {
      module: query.module,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      from: query.from,
      to: query.to,
      q: query.q,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toAuditSummaryApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const log = await auditService.get(tenantId, req.params.id as string);
    ok(res, toAuditDetailApi(log));
  },

  async exportCsv(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const query = req.query as unknown as ExportAuditQuery;
    const csv = await auditService.exportCsv(
      tenantId,
      {
        module: query.module,
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        userId: query.userId,
        from: query.from,
        to: query.to,
        q: query.q,
      },
      query.limit,
    );
    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  },
};
