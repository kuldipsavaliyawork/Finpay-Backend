import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { taxController } from './tax.controller';
import {
  createTaxRateSchema,
  updateTaxRateSchema,
  listTaxRateQuerySchema,
  createTaxGroupSchema,
  updateTaxGroupSchema,
  listTaxGroupQuerySchema,
  setGroupRatesSchema,
  idParamSchema,
  groupRateParamSchema,
  taxLiabilityQuerySchema,
} from './tax.dto';

export const taxRouter: Router = Router();

// All tax routes require an authenticated tenant user.
taxRouter.use(requireAuth, requireTenant);

// ── Tax liability summary — declared before '/rates/:id'-style routes are
// irrelevant here since rates/groups are separate sub-paths, but keep the
// report route grouped with its own prefix for clarity. ──────────────────────
taxRouter.get(
  '/liability-summary',
  requirePermission('tax:read'),
  validate(taxLiabilityQuerySchema, 'query'),
  asyncHandler(taxController.liabilitySummary),
);

// ── Tax rates ────────────────────────────────────────────────────────────────
taxRouter.get(
  '/rates',
  requirePermission('tax:read'),
  validate(listTaxRateQuerySchema, 'query'),
  asyncHandler(taxController.listRates),
);

taxRouter.get(
  '/rates/:id',
  requirePermission('tax:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(taxController.getRate),
);

taxRouter.post(
  '/rates',
  requirePermission('tax:manage'),
  validate(createTaxRateSchema),
  asyncHandler(taxController.createRate),
);

taxRouter.patch(
  '/rates/:id',
  requirePermission('tax:manage'),
  validate(idParamSchema, 'params'),
  validate(updateTaxRateSchema),
  asyncHandler(taxController.updateRate),
);

taxRouter.delete(
  '/rates/:id',
  requirePermission('tax:manage'),
  validate(idParamSchema, 'params'),
  asyncHandler(taxController.removeRate),
);

// ── Tax groups ───────────────────────────────────────────────────────────────
taxRouter.get(
  '/groups',
  requirePermission('tax:read'),
  validate(listTaxGroupQuerySchema, 'query'),
  asyncHandler(taxController.listGroups),
);

taxRouter.get(
  '/groups/:id',
  requirePermission('tax:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(taxController.getGroup),
);

taxRouter.post(
  '/groups',
  requirePermission('tax:manage'),
  validate(createTaxGroupSchema),
  asyncHandler(taxController.createGroup),
);

taxRouter.patch(
  '/groups/:id',
  requirePermission('tax:manage'),
  validate(idParamSchema, 'params'),
  validate(updateTaxGroupSchema),
  asyncHandler(taxController.updateGroup),
);

taxRouter.delete(
  '/groups/:id',
  requirePermission('tax:manage'),
  validate(idParamSchema, 'params'),
  asyncHandler(taxController.removeGroup),
);

// Group <-> rate links
taxRouter.put(
  '/groups/:id/rates',
  requirePermission('tax:manage'),
  validate(idParamSchema, 'params'),
  validate(setGroupRatesSchema),
  asyncHandler(taxController.setGroupRates),
);

taxRouter.post(
  '/groups/:id/rates/:rateId',
  requirePermission('tax:manage'),
  validate(groupRateParamSchema, 'params'),
  asyncHandler(taxController.addGroupRate),
);

taxRouter.delete(
  '/groups/:id/rates/:rateId',
  requirePermission('tax:manage'),
  validate(groupRateParamSchema, 'params'),
  asyncHandler(taxController.removeGroupRate),
);

registerOpenApiPaths(
  {
    '/tax/rates': {
      get: {
        tags: ['Tax'],
        summary: 'List tax rates (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'kind', in: 'query', schema: { type: 'string', enum: ['output', 'input'] } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'rate', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Tax'],
        summary: 'Create a tax rate',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate tax rate name' } },
      },
    },
    '/tax/rates/{id}': {
      get: {
        tags: ['Tax'],
        summary: 'Get a tax rate by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Tax'],
        summary: 'Update a tax rate',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate tax rate name' } },
      },
      delete: {
        tags: ['Tax'],
        summary: 'Soft-delete (deactivate) a tax rate',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/tax/groups': {
      get: {
        tags: ['Tax'],
        summary: 'List tax groups (paginated, filterable, sortable)',
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
        tags: ['Tax'],
        summary: 'Create a tax group, optionally linking rates by id',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate tax group name' } },
      },
    },
    '/tax/groups/{id}': {
      get: {
        tags: ['Tax'],
        summary: 'Get a tax group (with linked rates) by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Tax'],
        summary: 'Update a tax group',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate tax group name' } },
      },
      delete: {
        tags: ['Tax'],
        summary: 'Delete a tax group',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/tax/groups/{id}/rates': {
      put: {
        tags: ['Tax'],
        summary: 'Replace the full set of rates linked to a tax group',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/tax/groups/{id}/rates/{rateId}': {
      post: {
        tags: ['Tax'],
        summary: 'Link a single tax rate to a tax group',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'rateId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 201: { description: 'Created' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Tax'],
        summary: 'Unlink a single tax rate from a tax group',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'rateId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/tax/liability-summary': {
      get: {
        tags: ['Tax'],
        summary: 'Tax liability summary (output tax − input tax) over a period, from posted ledger documents',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
  [{ name: 'Tax', description: 'Tax configuration (rates, groups) and tax liability reporting' }],
);
