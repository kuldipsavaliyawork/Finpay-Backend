import type { Request, Response } from 'express';
import { ok } from '../../common/http';
import { dashboardService } from './dashboard.service';

export const dashboardController = {
  async summary(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    ok(res, await dashboardService.summary(tenantId));
  },

  async recentActivity(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const rawLimit = Number((req.query as Record<string, unknown>).limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 10;
    ok(res, await dashboardService.recentActivity(tenantId, limit));
  },
};
