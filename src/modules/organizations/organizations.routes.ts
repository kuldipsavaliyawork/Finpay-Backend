import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { organizationsController } from './organizations.controller';
import {
  updateTenantProfileSchema,
  updateTenantSettingsSchema,
  createFinancialYearSchema,
  updateFinancialYearSchema,
  listFinancialYearQuerySchema,
  createCurrencySchema,
  updateCurrencySchema,
  listCurrencyQuerySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentQuerySchema,
  createBranchSchema,
  updateBranchSchema,
  listBranchQuerySchema,
  idParamSchema,
} from './organizations.dto';

export const organizationsRouter: Router = Router();

// All organization routes require an authenticated tenant user.
organizationsRouter.use(requireAuth, requireTenant);

// ── Tenant profile ─────────────────────────────────────────────────────────
organizationsRouter.get(
  '/profile',
  requirePermission('tenant:read'),
  asyncHandler(organizationsController.getProfile),
);

organizationsRouter.patch(
  '/profile',
  requirePermission('tenant:update'),
  validate(updateTenantProfileSchema),
  asyncHandler(organizationsController.updateProfile),
);

// ── Tenant settings (singleton: numbering prefixes, lockout/password policy) ─
organizationsRouter.get(
  '/settings',
  requirePermission('settings:read'),
  asyncHandler(organizationsController.getSettings),
);

organizationsRouter.patch(
  '/settings',
  requirePermission('settings:update'),
  validate(updateTenantSettingsSchema),
  asyncHandler(organizationsController.updateSettings),
);

// ── Financial years ─────────────────────────────────────────────────────────────
organizationsRouter.get(
  '/financial-years',
  requirePermission('financialyear:read'),
  validate(listFinancialYearQuerySchema, 'query'),
  asyncHandler(organizationsController.listFinancialYears),
);

organizationsRouter.get(
  '/financial-years/:id',
  requirePermission('financialyear:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.getFinancialYear),
);

organizationsRouter.post(
  '/financial-years',
  requirePermission('financialyear:create'),
  validate(createFinancialYearSchema),
  asyncHandler(organizationsController.createFinancialYear),
);

organizationsRouter.patch(
  '/financial-years/:id',
  requirePermission('financialyear:update'),
  validate(idParamSchema, 'params'),
  validate(updateFinancialYearSchema),
  asyncHandler(organizationsController.updateFinancialYear),
);

organizationsRouter.delete(
  '/financial-years/:id',
  requirePermission('financialyear:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.removeFinancialYear),
);

// ── Currencies ───────────────────────────────────────────────────────────────
organizationsRouter.get(
  '/currencies',
  requirePermission('currency:read'),
  validate(listCurrencyQuerySchema, 'query'),
  asyncHandler(organizationsController.listCurrencies),
);

organizationsRouter.get(
  '/currencies/:id',
  requirePermission('currency:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.getCurrency),
);

organizationsRouter.post(
  '/currencies',
  requirePermission('currency:create'),
  validate(createCurrencySchema),
  asyncHandler(organizationsController.createCurrency),
);

organizationsRouter.patch(
  '/currencies/:id',
  requirePermission('currency:update'),
  validate(idParamSchema, 'params'),
  validate(updateCurrencySchema),
  asyncHandler(organizationsController.updateCurrency),
);

organizationsRouter.delete(
  '/currencies/:id',
  requirePermission('currency:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.removeCurrency),
);

// ── Departments ──────────────────────────────────────────────────────────────
organizationsRouter.get(
  '/departments',
  requirePermission('department:read'),
  validate(listDepartmentQuerySchema, 'query'),
  asyncHandler(organizationsController.listDepartments),
);

organizationsRouter.get(
  '/departments/:id',
  requirePermission('department:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.getDepartment),
);

organizationsRouter.post(
  '/departments',
  requirePermission('department:create'),
  validate(createDepartmentSchema),
  asyncHandler(organizationsController.createDepartment),
);

organizationsRouter.patch(
  '/departments/:id',
  requirePermission('department:update'),
  validate(idParamSchema, 'params'),
  validate(updateDepartmentSchema),
  asyncHandler(organizationsController.updateDepartment),
);

organizationsRouter.delete(
  '/departments/:id',
  requirePermission('department:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.removeDepartment),
);

// ── Branches ─────────────────────────────────────────────────────────────────
organizationsRouter.get(
  '/branches',
  requirePermission('branch:read'),
  validate(listBranchQuerySchema, 'query'),
  asyncHandler(organizationsController.listBranches),
);

organizationsRouter.get(
  '/branches/:id',
  requirePermission('branch:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.getBranch),
);

organizationsRouter.post(
  '/branches',
  requirePermission('branch:create'),
  validate(createBranchSchema),
  asyncHandler(organizationsController.createBranch),
);

organizationsRouter.patch(
  '/branches/:id',
  requirePermission('branch:update'),
  validate(idParamSchema, 'params'),
  validate(updateBranchSchema),
  asyncHandler(organizationsController.updateBranch),
);

organizationsRouter.delete(
  '/branches/:id',
  requirePermission('branch:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(organizationsController.removeBranch),
);

registerOpenApiPaths(
  {
    '/organizations/profile': {
      get: {
        tags: ['Organizations'],
        summary: 'Get tenant/organization profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update tenant/organization profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/organizations/settings': {
      get: {
        tags: ['Organizations'],
        summary: 'Get tenant settings (numbering prefixes, lockout/password policy)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update tenant settings',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/organizations/financial-years': {
      get: {
        tags: ['Organizations'],
        summary: 'List financial years (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'closed'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'startDate', 'endDate', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Organizations'],
        summary: 'Create a financial year',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate name' } },
      },
    },
    '/organizations/financial-years/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get a financial year by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update a financial year',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate name' } },
      },
      delete: {
        tags: ['Organizations'],
        summary: 'Delete a financial year',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/organizations/currencies': {
      get: {
        tags: ['Organizations'],
        summary: 'List currencies (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'isBase', in: 'query', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['code', 'name', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Organizations'],
        summary: 'Create a currency',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate code' } },
      },
    },
    '/organizations/currencies/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get a currency by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update a currency',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Organizations'],
        summary: 'Delete a currency (cannot delete the base currency)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' }, 422: { description: 'Cannot delete base currency' } },
      },
    },
    '/organizations/departments': {
      get: {
        tags: ['Organizations'],
        summary: 'List departments (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'code', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Organizations'],
        summary: 'Create a department',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/organizations/departments/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get a department by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update a department',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Organizations'],
        summary: 'Soft-delete a department',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/organizations/branches': {
      get: {
        tags: ['Organizations'],
        summary: 'List branches (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'code', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Organizations'],
        summary: 'Create a branch',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/organizations/branches/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get a branch by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Organizations'],
        summary: 'Update a branch',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Organizations'],
        summary: 'Soft-delete a branch',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Organizations', description: 'Tenant profile/settings, financial years, currencies, departments, branches' }],
);
