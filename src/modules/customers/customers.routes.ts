import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { customersController } from './customers.controller';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
  idParamSchema,
  statementQuerySchema,
  agingQuerySchema,
} from './customers.dto';

export const customersRouter: Router = Router();

// All customer routes require an authenticated tenant user.
customersRouter.use(requireAuth, requireTenant);

customersRouter.get(
  '/',
  requirePermission('customer:read'),
  validate(listCustomerQuerySchema, 'query'),
  asyncHandler(customersController.list),
);

// Receivable aging across (optionally filtered to one) customer — must be
// declared before '/:id' so it isn't swallowed by the id-param route.
customersRouter.get(
  '/receivable-aging',
  requirePermission('customer:read'),
  validate(agingQuerySchema, 'query'),
  asyncHandler(customersController.receivableAging),
);

customersRouter.get(
  '/:id',
  requirePermission('customer:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(customersController.get),
);

customersRouter.get(
  '/:id/statement',
  requirePermission('customer:read'),
  validate(idParamSchema, 'params'),
  validate(statementQuerySchema, 'query'),
  asyncHandler(customersController.statement),
);

customersRouter.get(
  '/:id/outstanding-balance',
  requirePermission('customer:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(customersController.outstandingBalance),
);

customersRouter.post(
  '/',
  requirePermission('customer:create'),
  validate(createCustomerSchema),
  asyncHandler(customersController.create),
);

customersRouter.patch(
  '/:id',
  requirePermission('customer:update'),
  validate(idParamSchema, 'params'),
  validate(updateCustomerSchema),
  asyncHandler(customersController.update),
);

customersRouter.delete(
  '/:id',
  requirePermission('customer:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(customersController.remove),
);

registerOpenApiPaths(
  {
    '/customers': {
      get: {
        tags: ['Customers'],
        summary: 'List customers (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Customers'],
        summary: 'Create a customer',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate customer name' } },
      },
    },
    '/customers/receivable-aging': {
      get: {
        tags: ['Customers'],
        summary: 'Accounts-receivable aging report (bucketed by days past due)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/customers/{id}': {
      get: {
        tags: ['Customers'],
        summary: 'Get a customer by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Customers'],
        summary: 'Update a customer',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate customer name' } },
      },
      delete: {
        tags: ['Customers'],
        summary: 'Soft-delete (deactivate) a customer',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/customers/{id}/statement': {
      get: {
        tags: ['Customers'],
        summary: 'Customer statement — chronological invoices/payments with running balance',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/customers/{id}/outstanding-balance': {
      get: {
        tags: ['Customers'],
        summary: 'Outstanding (unpaid) balance for a customer',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Customers', description: 'Accounts receivable — customer master, statements, aging' }],
);
