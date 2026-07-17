import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { reportsController } from './reports.controller';
import { reportQuerySchema } from './reports.dto';

export const reportsRouter: Router = Router();

reportsRouter.use(requireAuth, requireTenant);

reportsRouter.get(
  '/trial-balance',
  requirePermission('report:read'),
  validate(reportQuerySchema, 'query'),
  asyncHandler(reportsController.trialBalance),
);

reportsRouter.get(
  '/balance-sheet',
  requirePermission('report:read'),
  validate(reportQuerySchema, 'query'),
  asyncHandler(reportsController.balanceSheet),
);

reportsRouter.get(
  '/profit-and-loss',
  requirePermission('report:read'),
  validate(reportQuerySchema, 'query'),
  asyncHandler(reportsController.profitAndLoss),
);

const asOfParam = { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } };

registerOpenApiPaths(
  {
    '/reports/trial-balance': {
      get: {
        tags: ['Reports'],
        summary: 'Trial balance — per-account debit/credit with balanced totals',
        security: [{ bearerAuth: [] }],
        parameters: [asOfParam],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/balance-sheet': {
      get: {
        tags: ['Reports'],
        summary: 'Balance sheet — assets = liabilities + equity',
        security: [{ bearerAuth: [] }],
        parameters: [asOfParam],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/profit-and-loss': {
      get: {
        tags: ['Reports'],
        summary: 'Profit & loss — income, expenses, net profit',
        security: [{ bearerAuth: [] }],
        parameters: [asOfParam],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
  [{ name: 'Reports', description: 'Financial statements derived from the ledger' }],
);
