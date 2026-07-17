import type { Request, Response } from 'express';
import { ok } from '../../common/http';
import { reportsService } from './reports.service';
import type { ReportQuery } from './reports.dto';

export const reportsController = {
  async trialBalance(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const q = req.query as unknown as ReportQuery;
    ok(res, await reportsService.trialBalance(tenantId, { asOf: q.asOf }));
  },

  async balanceSheet(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const q = req.query as unknown as ReportQuery;
    ok(res, await reportsService.balanceSheet(tenantId, { asOf: q.asOf }));
  },

  async profitAndLoss(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const q = req.query as unknown as ReportQuery;
    ok(res, await reportsService.profitAndLoss(tenantId, { asOf: q.asOf }));
  },
};
