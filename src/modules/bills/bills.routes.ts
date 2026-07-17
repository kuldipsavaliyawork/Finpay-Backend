import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { billsController } from './bills.controller';
import {
  createBillSchema,
  updateBillSchema,
  listBillQuerySchema,
  idParamSchema,
  cancelBillSchema,
} from './bills.dto';

export const billsRouter: Router = Router();

// All bill routes require an authenticated tenant user.
billsRouter.use(requireAuth, requireTenant);

billsRouter.get(
  '/',
  requirePermission('bill:read'),
  validate(listBillQuerySchema, 'query'),
  asyncHandler(billsController.list),
);

billsRouter.get(
  '/:id',
  requirePermission('bill:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(billsController.get),
);

billsRouter.post(
  '/',
  requirePermission('bill:create'),
  validate(createBillSchema),
  asyncHandler(billsController.create),
);

billsRouter.patch(
  '/:id',
  requirePermission('bill:update'),
  validate(idParamSchema, 'params'),
  validate(updateBillSchema),
  asyncHandler(billsController.update),
);

// draft -> pending. No ledger effect, so no idempotency guard required.
billsRouter.post(
  '/:id/submit',
  requirePermission('bill:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(billsController.submit),
);

// pending -> approved: writes a balanced AP journal entry — idempotency-guarded.
billsRouter.post(
  '/:id/approve',
  requirePermission('bill:post'),
  validate(idParamSchema, 'params'),
  idempotency(),
  asyncHandler(billsController.approve),
);

billsRouter.post(
  '/:id/cancel',
  requirePermission('bill:update'),
  validate(idParamSchema, 'params'),
  validate(cancelBillSchema),
  asyncHandler(billsController.cancel),
);

billsRouter.delete(
  '/:id',
  requirePermission('bill:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(billsController.remove),
);

registerOpenApiPaths(
  {
    '/bills': {
      get: {
        tags: ['Bills'],
        summary: 'List bills (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['draft', 'pending', 'approved', 'partial', 'paid', 'overdue', 'cancelled'],
            },
          },
          { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: { type: 'string', enum: ['number', 'issueDate', 'dueDate', 'total', 'createdAt'] },
          },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Bills'],
        summary: 'Create a draft bill',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Vendor not found' } },
      },
    },
    '/bills/{id}': {
      get: {
        tags: ['Bills'],
        summary: 'Get a bill by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Bills'],
        summary: 'Update a draft bill',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Only drafts editable' } },
      },
      delete: {
        tags: ['Bills'],
        summary: 'Delete a draft bill',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 422: { description: 'Only drafts deletable' } },
      },
    },
    '/bills/{id}/submit': {
      post: {
        tags: ['Bills'],
        summary: 'Submit a draft bill for approval (draft -> pending)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Invalid transition' } },
      },
    },
    '/bills/{id}/approve': {
      post: {
        tags: ['Bills'],
        summary: 'Approve (post) a bill -> balanced AP journal entry (Dr Expense, Dr Input Tax, Cr AP)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Already posted / invalid transition' } },
      },
    },
    '/bills/{id}/cancel': {
      post: {
        tags: ['Bills'],
        summary: 'Cancel a bill',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Invalid transition' } },
      },
    },
  },
  [{ name: 'Bills', description: 'Accounts payable — vendor bills & expense recognition' }],
);
