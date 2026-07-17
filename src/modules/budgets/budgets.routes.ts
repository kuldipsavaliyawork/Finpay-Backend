import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { budgetsController } from './budgets.controller';
import {
  createBudgetSchema,
  updateBudgetSchema,
  listBudgetQuerySchema,
  idParamSchema,
  budgetLineIdParamSchema,
  createBudgetLineSchema,
  updateBudgetLineSchema,
  listBudgetLineQuerySchema,
  varianceQuerySchema,
} from './budgets.dto';

export const budgetsRouter: Router = Router();

// All budget routes require an authenticated tenant user.
budgetsRouter.use(requireAuth, requireTenant);

budgetsRouter.get(
  '/',
  requirePermission('budget:read'),
  validate(listBudgetQuerySchema, 'query'),
  asyncHandler(budgetsController.list),
);

budgetsRouter.get(
  '/:id',
  requirePermission('budget:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(budgetsController.get),
);

budgetsRouter.post(
  '/',
  requirePermission('budget:create'),
  validate(createBudgetSchema),
  asyncHandler(budgetsController.create),
);

budgetsRouter.patch(
  '/:id',
  requirePermission('budget:update'),
  validate(idParamSchema, 'params'),
  validate(updateBudgetSchema),
  asyncHandler(budgetsController.update),
);

budgetsRouter.delete(
  '/:id',
  requirePermission('budget:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(budgetsController.remove),
);

// ── Budget-vs-actual (must be declared before '/:id/lines/:lineId' collisions
// aren't an issue here since the path segment differs, but keep report route
// grouped with the parent resource for readability). ──────────────────────────
budgetsRouter.get(
  '/:id/variance',
  requirePermission('budget:read'),
  validate(idParamSchema, 'params'),
  validate(varianceQuerySchema, 'query'),
  asyncHandler(budgetsController.variance),
);

// ── Budget lines ────────────────────────────────────────────────────────────
budgetsRouter.get(
  '/:id/lines',
  requirePermission('budget:read'),
  validate(idParamSchema, 'params'),
  validate(listBudgetLineQuerySchema, 'query'),
  asyncHandler(budgetsController.listLines),
);

budgetsRouter.get(
  '/:id/lines/:lineId',
  requirePermission('budget:read'),
  validate(budgetLineIdParamSchema, 'params'),
  asyncHandler(budgetsController.getLine),
);

budgetsRouter.post(
  '/:id/lines',
  requirePermission('budget:create'),
  validate(idParamSchema, 'params'),
  validate(createBudgetLineSchema),
  asyncHandler(budgetsController.createLine),
);

budgetsRouter.patch(
  '/:id/lines/:lineId',
  requirePermission('budget:update'),
  validate(budgetLineIdParamSchema, 'params'),
  validate(updateBudgetLineSchema),
  asyncHandler(budgetsController.updateLine),
);

budgetsRouter.delete(
  '/:id/lines/:lineId',
  requirePermission('budget:delete'),
  validate(budgetLineIdParamSchema, 'params'),
  asyncHandler(budgetsController.removeLine),
);

registerOpenApiPaths(
  {
    '/budgets': {
      get: {
        tags: ['Budgets'],
        summary: 'List budgets (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'financialYear', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'active', 'archived'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'financialYear', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Budgets'],
        summary: 'Create a budget (optionally with initial budget lines)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate budget name for financial year' } },
      },
    },
    '/budgets/{id}': {
      get: {
        tags: ['Budgets'],
        summary: 'Get a budget (with lines) by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Budgets'],
        summary: 'Update a budget',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate budget name for financial year' } },
      },
      delete: {
        tags: ['Budgets'],
        summary: 'Delete a budget (cascades to its budget lines)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/budgets/{id}/variance': {
      get: {
        tags: ['Budgets'],
        summary: 'Budget-vs-actual — variance per account/period from posted journal lines',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
          { name: 'to', in: 'query', schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
          { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/budgets/{id}/lines': {
      get: {
        tags: ['Budgets'],
        summary: 'List budget lines',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'period', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      post: {
        tags: ['Budgets'],
        summary: 'Add a budget line',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Budget or account not found' } },
      },
    },
    '/budgets/{id}/lines/{lineId}': {
      get: {
        tags: ['Budgets'],
        summary: 'Get a budget line',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'lineId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Budgets'],
        summary: 'Update a budget line',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'lineId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Budgets'],
        summary: 'Delete a budget line',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'lineId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Budgets', description: 'Budgeting — Budget + BudgetLine CRUD and budget-vs-actual variance' }],
);
