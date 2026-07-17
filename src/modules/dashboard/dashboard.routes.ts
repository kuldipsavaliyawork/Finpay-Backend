import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { dashboardController } from './dashboard.controller';

export const dashboardRouter: Router = Router();

dashboardRouter.use(requireAuth, requireTenant);

// Dashboard reads aggregate finance data; report:read is the natural grant.
dashboardRouter.get(
  '/summary',
  requirePermission('report:read'),
  asyncHandler(dashboardController.summary),
);

dashboardRouter.get(
  '/recent-activity',
  requirePermission('report:read'),
  asyncHandler(dashboardController.recentActivity),
);

registerOpenApiPaths(
  {
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Headline finance KPIs (AR, AP, cash, revenue, expenses, counts)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/dashboard/recent-activity': {
      get: {
        tags: ['Dashboard'],
        summary: 'Recent payments and posted journal entries',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
  [{ name: 'Dashboard', description: 'Aggregate finance KPIs and activity feed' }],
);
