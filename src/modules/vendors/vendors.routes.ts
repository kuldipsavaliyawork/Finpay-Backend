import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { vendorsController } from './vendors.controller';
import {
  createVendorSchema,
  updateVendorSchema,
  listVendorQuerySchema,
  idParamSchema,
  statementQuerySchema,
  agingQuerySchema,
} from './vendors.dto';

export const vendorsRouter: Router = Router();

// All vendor routes require an authenticated tenant user.
vendorsRouter.use(requireAuth, requireTenant);

vendorsRouter.get(
  '/',
  requirePermission('vendor:read'),
  validate(listVendorQuerySchema, 'query'),
  asyncHandler(vendorsController.list),
);

// Payable aging across (optionally filtered to one) vendor — must be declared
// before '/:id' so it isn't swallowed by the id-param route.
vendorsRouter.get(
  '/payable-aging',
  requirePermission('vendor:read'),
  validate(agingQuerySchema, 'query'),
  asyncHandler(vendorsController.payableAging),
);

vendorsRouter.get(
  '/:id',
  requirePermission('vendor:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(vendorsController.get),
);

vendorsRouter.get(
  '/:id/statement',
  requirePermission('vendor:read'),
  validate(idParamSchema, 'params'),
  validate(statementQuerySchema, 'query'),
  asyncHandler(vendorsController.statement),
);

vendorsRouter.post(
  '/',
  requirePermission('vendor:create'),
  validate(createVendorSchema),
  asyncHandler(vendorsController.create),
);

vendorsRouter.patch(
  '/:id',
  requirePermission('vendor:update'),
  validate(idParamSchema, 'params'),
  validate(updateVendorSchema),
  asyncHandler(vendorsController.update),
);

vendorsRouter.delete(
  '/:id',
  requirePermission('vendor:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(vendorsController.remove),
);

registerOpenApiPaths(
  {
    '/vendors': {
      get: {
        tags: ['Vendors'],
        summary: 'List vendors (paginated, filterable, sortable)',
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
        tags: ['Vendors'],
        summary: 'Create a vendor',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate vendor name' } },
      },
    },
    '/vendors/payable-aging': {
      get: {
        tags: ['Vendors'],
        summary: 'Accounts-payable aging report (bucketed by days past due)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/vendors/{id}': {
      get: {
        tags: ['Vendors'],
        summary: 'Get a vendor by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Vendors'],
        summary: 'Update a vendor',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate vendor name' } },
      },
      delete: {
        tags: ['Vendors'],
        summary: 'Soft-delete (deactivate) a vendor',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/vendors/{id}/statement': {
      get: {
        tags: ['Vendors'],
        summary: 'Vendor statement — chronological bills/payments with running balance',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Vendors', description: 'Accounts payable — vendor master, statements, aging' }],
);
