import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { accountsController } from './accounts.controller';
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountQuerySchema,
  idParamSchema,
  treeQuerySchema,
  balanceQuerySchema,
} from './accounts.dto';

export const accountsRouter: Router = Router();

// All chart-of-accounts routes require an authenticated tenant user.
accountsRouter.use(requireAuth, requireTenant);

accountsRouter.get(
  '/',
  requirePermission('account:read'),
  validate(listAccountQuerySchema, 'query'),
  asyncHandler(accountsController.list),
);

// Hierarchical tree read — declared before '/:id' so it isn't swallowed by the
// id-param route.
accountsRouter.get(
  '/tree',
  requirePermission('account:read'),
  validate(treeQuerySchema, 'query'),
  asyncHandler(accountsController.tree),
);

accountsRouter.get(
  '/:id',
  requirePermission('account:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(accountsController.get),
);

accountsRouter.get(
  '/:id/balance',
  requirePermission('account:read'),
  validate(idParamSchema, 'params'),
  validate(balanceQuerySchema, 'query'),
  asyncHandler(accountsController.balance),
);

accountsRouter.post(
  '/',
  requirePermission('account:create'),
  validate(createAccountSchema),
  asyncHandler(accountsController.create),
);

accountsRouter.patch(
  '/:id',
  requirePermission('account:update'),
  validate(idParamSchema, 'params'),
  validate(updateAccountSchema),
  asyncHandler(accountsController.update),
);

accountsRouter.post(
  '/:id/activate',
  requirePermission('account:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(accountsController.activate),
);

accountsRouter.post(
  '/:id/deactivate',
  requirePermission('account:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(accountsController.deactivate),
);

accountsRouter.delete(
  '/:id',
  requirePermission('account:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(accountsController.remove),
);

registerOpenApiPaths(
  {
    '/accounts': {
      get: {
        tags: ['Accounts'],
        summary: 'List chart-of-accounts entries (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'parentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['code', 'name', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Accounts'],
        summary: 'Create a chart-of-accounts entry',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate account code' } },
      },
    },
    '/accounts/tree': {
      get: {
        tags: ['Accounts'],
        summary: 'Chart of accounts as a hierarchical tree',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] } },
          { name: 'includeInactive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/accounts/{id}': {
      get: {
        tags: ['Accounts'],
        summary: 'Get an account by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Accounts'],
        summary: 'Update an account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate account code' }, 422: { description: 'Invalid parent (cycle/self)' } },
      },
      delete: {
        tags: ['Accounts'],
        summary: 'Delete an account (blocked for system accounts, accounts with children, or posted activity)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' }, 409: { description: 'Has children or posted activity' }, 422: { description: 'System account' } },
      },
    },
    '/accounts/{id}/balance': {
      get: {
        tags: ['Accounts'],
        summary: 'Account balance — opening balance + posted journal activity (optionally as-of a date)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/accounts/{id}/activate': {
      post: {
        tags: ['Accounts'],
        summary: 'Activate an account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/accounts/{id}/deactivate': {
      post: {
        tags: ['Accounts'],
        summary: 'Deactivate an account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Accounts', description: 'Chart of Accounts — hierarchical account master, tree, balances' }],
);
