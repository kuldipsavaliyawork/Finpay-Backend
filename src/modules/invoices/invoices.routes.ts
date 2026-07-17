import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { invoicesController } from './invoices.controller';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoiceQuerySchema,
  idParamSchema,
} from './invoices.dto';

export const invoicesRouter: Router = Router();

invoicesRouter.use(requireAuth, requireTenant);

invoicesRouter.get(
  '/',
  requirePermission('invoice:read'),
  validate(listInvoiceQuerySchema, 'query'),
  asyncHandler(invoicesController.list),
);

invoicesRouter.get(
  '/:id',
  requirePermission('invoice:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(invoicesController.get),
);

invoicesRouter.post(
  '/',
  requirePermission('invoice:create'),
  validate(createInvoiceSchema),
  asyncHandler(invoicesController.create),
);

invoicesRouter.patch(
  '/:id',
  requirePermission('invoice:update'),
  validate(idParamSchema, 'params'),
  validate(updateInvoiceSchema),
  asyncHandler(invoicesController.update),
);

// Posting an invoice writes to the immutable ledger — idempotency-guarded.
invoicesRouter.post(
  '/:id/post',
  requirePermission('invoice:post'),
  validate(idParamSchema, 'params'),
  idempotency(),
  asyncHandler(invoicesController.post),
);

invoicesRouter.delete(
  '/:id',
  requirePermission('invoice:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(invoicesController.remove),
);

registerOpenApiPaths(
  {
    '/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List invoices (paginated, filterable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'] } },
          { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Invoices'],
        summary: 'Create a draft invoice',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Customer not found' } },
      },
    },
    '/invoices/{id}': {
      get: {
        tags: ['Invoices'],
        summary: 'Get an invoice by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Invoices'],
        summary: 'Update a draft invoice',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Only drafts editable' } },
      },
      delete: {
        tags: ['Invoices'],
        summary: 'Delete a draft invoice',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' } },
      },
    },
    '/invoices/{id}/post': {
      post: {
        tags: ['Invoices'],
        summary: 'Post (finalize) an invoice → balanced AR journal entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Already posted' } },
      },
    },
  },
  [{ name: 'Invoices', description: 'Accounts receivable — invoicing & revenue recognition' }],
);
