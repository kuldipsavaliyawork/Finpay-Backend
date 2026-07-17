import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { expenseCategoriesController, expensesController } from './expenses.controller';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  listExpenseCategoryQuerySchema,
  createExpenseSchema,
  updateExpenseSchema,
  listExpenseQuerySchema,
  rejectExpenseSchema,
  idParamSchema,
} from './expenses.dto';

/**
 * Expense categories router — mount at /expense-categories.
 */
export const expenseCategoriesRouter: Router = Router();
expenseCategoriesRouter.use(requireAuth, requireTenant);

expenseCategoriesRouter.get(
  '/',
  requirePermission('expensecategory:read'),
  validate(listExpenseCategoryQuerySchema, 'query'),
  asyncHandler(expenseCategoriesController.list),
);

expenseCategoriesRouter.get(
  '/:id',
  requirePermission('expensecategory:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(expenseCategoriesController.get),
);

expenseCategoriesRouter.post(
  '/',
  requirePermission('expensecategory:create'),
  validate(createExpenseCategorySchema),
  asyncHandler(expenseCategoriesController.create),
);

expenseCategoriesRouter.patch(
  '/:id',
  requirePermission('expensecategory:update'),
  validate(idParamSchema, 'params'),
  validate(updateExpenseCategorySchema),
  asyncHandler(expenseCategoriesController.update),
);

expenseCategoriesRouter.delete(
  '/:id',
  requirePermission('expensecategory:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(expenseCategoriesController.remove),
);

/**
 * Expenses router — mount at /expenses.
 */
export const expensesRouter: Router = Router();
expensesRouter.use(requireAuth, requireTenant);

expensesRouter.get(
  '/',
  requirePermission('expense:read'),
  validate(listExpenseQuerySchema, 'query'),
  asyncHandler(expensesController.list),
);

expensesRouter.get(
  '/:id',
  requirePermission('expense:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(expensesController.get),
);

expensesRouter.post(
  '/',
  requirePermission('expense:create'),
  validate(createExpenseSchema),
  asyncHandler(expensesController.create),
);

expensesRouter.patch(
  '/:id',
  requirePermission('expense:update'),
  validate(idParamSchema, 'params'),
  validate(updateExpenseSchema),
  asyncHandler(expensesController.update),
);

expensesRouter.delete(
  '/:id',
  requirePermission('expense:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(expensesController.remove),
);

// Submit a draft/rejected expense for approval.
expensesRouter.post(
  '/:id/submit',
  requirePermission('expense:submit'),
  validate(idParamSchema, 'params'),
  asyncHandler(expensesController.submit),
);

// Approving writes to the immutable ledger — idempotency-guarded.
expensesRouter.post(
  '/:id/approve',
  requirePermission('expense:approve'),
  validate(idParamSchema, 'params'),
  idempotency(),
  asyncHandler(expensesController.approve),
);

expensesRouter.post(
  '/:id/reject',
  requirePermission('expense:reject'),
  validate(idParamSchema, 'params'),
  validate(rejectExpenseSchema),
  asyncHandler(expensesController.reject),
);

expensesRouter.post(
  '/:id/reimburse',
  requirePermission('expense:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(expensesController.reimburse),
);

registerOpenApiPaths(
  {
    '/expense-categories': {
      get: {
        tags: ['Expenses'],
        summary: 'List expense categories (paginated, filterable, sortable)',
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
        tags: ['Expenses'],
        summary: 'Create an expense category',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate category name' } },
      },
    },
    '/expense-categories/{id}': {
      get: {
        tags: ['Expenses'],
        summary: 'Get an expense category by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Expenses'],
        summary: 'Update an expense category',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 409: { description: 'Duplicate category name' } },
      },
      delete: {
        tags: ['Expenses'],
        summary: 'Delete an expense category (rejected if in use)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' }, 409: { description: 'Category in use' } },
      },
    },
    '/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'List expenses (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'approved', 'rejected', 'reimbursed'] } },
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['date', 'amount', 'status', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Create a draft expense',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Category/vendor/department not found' } },
      },
    },
    '/expenses/{id}': {
      get: {
        tags: ['Expenses'],
        summary: 'Get an expense by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Expenses'],
        summary: 'Update a draft expense',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Only drafts editable' } },
      },
      delete: {
        tags: ['Expenses'],
        summary: 'Delete a draft or rejected expense',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 422: { description: 'Not deletable in current status' } },
      },
    },
    '/expenses/{id}/submit': {
      post: {
        tags: ['Expenses'],
        summary: 'Submit a draft/rejected expense for approval',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Invalid status transition' } },
      },
    },
    '/expenses/{id}/approve': {
      post: {
        tags: ['Expenses'],
        summary: 'Approve a pending expense -> balanced expense journal entry (Dr Expense, Cr Cash/Bank)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Invalid status transition' } },
      },
    },
    '/expenses/{id}/reject': {
      post: {
        tags: ['Expenses'],
        summary: 'Reject a pending expense',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Invalid status transition' } },
      },
    },
    '/expenses/{id}/reimburse': {
      post: {
        tags: ['Expenses'],
        summary: 'Mark an approved expense as reimbursed',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Invalid status transition' } },
      },
    },
  },
  [{ name: 'Expenses', description: 'Expense categories, expense entry, and the approval-to-ledger workflow' }],
);
