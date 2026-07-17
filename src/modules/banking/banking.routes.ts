import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { bankAccountsController, bankTransactionsController, reconciliationsController } from './banking.controller';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  listBankAccountQuerySchema,
  listBankTransactionQuerySchema,
  importCsvSchema,
  matchTransactionSchema,
  createReconciliationSchema,
  listReconciliationQuerySchema,
  idParamSchema,
} from './banking.dto';

/**
 * Bank accounts router — mount at /bank-accounts.
 */
export const bankAccountsRouter: Router = Router();
bankAccountsRouter.use(requireAuth, requireTenant);

bankAccountsRouter.get(
  '/',
  requirePermission('bank:read'),
  validate(listBankAccountQuerySchema, 'query'),
  asyncHandler(bankAccountsController.list),
);

bankAccountsRouter.get(
  '/:id',
  requirePermission('bank:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(bankAccountsController.get),
);

bankAccountsRouter.post(
  '/',
  requirePermission('bank:manage'),
  validate(createBankAccountSchema),
  asyncHandler(bankAccountsController.create),
);

bankAccountsRouter.patch(
  '/:id',
  requirePermission('bank:manage'),
  validate(idParamSchema, 'params'),
  validate(updateBankAccountSchema),
  asyncHandler(bankAccountsController.update),
);

bankAccountsRouter.delete(
  '/:id',
  requirePermission('bank:manage'),
  validate(idParamSchema, 'params'),
  asyncHandler(bankAccountsController.remove),
);

/**
 * Bank transactions router — mount at /bank-transactions.
 */
export const bankTransactionsRouter: Router = Router();
bankTransactionsRouter.use(requireAuth, requireTenant);

bankTransactionsRouter.get(
  '/',
  requirePermission('bank:read'),
  validate(listBankTransactionQuerySchema, 'query'),
  asyncHandler(bankTransactionsController.list),
);

bankTransactionsRouter.get(
  '/:id',
  requirePermission('bank:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(bankTransactionsController.get),
);

// CSV import creates a batch of transactions — idempotency-guarded.
bankTransactionsRouter.post(
  '/import',
  requirePermission('bank:manage'),
  idempotency(),
  validate(importCsvSchema),
  asyncHandler(bankTransactionsController.importCsv),
);

bankTransactionsRouter.post(
  '/:id/match',
  requirePermission('bank:manage'),
  validate(idParamSchema, 'params'),
  validate(matchTransactionSchema),
  asyncHandler(bankTransactionsController.match),
);

bankTransactionsRouter.post(
  '/:id/unmatch',
  requirePermission('bank:manage'),
  validate(idParamSchema, 'params'),
  asyncHandler(bankTransactionsController.unmatch),
);

/**
 * Reconciliations router — mount at /reconciliations.
 */
export const reconciliationsRouter: Router = Router();
reconciliationsRouter.use(requireAuth, requireTenant);

reconciliationsRouter.get(
  '/',
  requirePermission('reconciliation:read'),
  validate(listReconciliationQuerySchema, 'query'),
  asyncHandler(reconciliationsController.list),
);

reconciliationsRouter.get(
  '/:id',
  requirePermission('reconciliation:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(reconciliationsController.get),
);

reconciliationsRouter.post(
  '/',
  requirePermission('reconciliation:manage'),
  validate(createReconciliationSchema),
  asyncHandler(reconciliationsController.create),
);

reconciliationsRouter.post(
  '/:id/complete',
  requirePermission('reconciliation:manage'),
  validate(idParamSchema, 'params'),
  idempotency(),
  asyncHandler(reconciliationsController.complete),
);

registerOpenApiPaths(
  {
    '/bank-accounts': {
      get: {
        tags: ['Banking'],
        summary: 'List bank accounts (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['bank', 'cash'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Banking'],
        summary: 'Create a bank account (maps to a COA asset account)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'COA account not found' }, 409: { description: 'Account already mapped' } },
      },
    },
    '/bank-accounts/{id}': {
      get: {
        tags: ['Banking'],
        summary: 'Get a bank account by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Banking'],
        summary: 'Update a bank account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Banking'],
        summary: 'Soft-delete a bank account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
    '/bank-transactions': {
      get: {
        tags: ['Banking'],
        summary: 'List bank transactions (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'bankAccountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['unmatched', 'matched', 'ignored'] } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['credit', 'debit'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'importBatchId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['date', 'amount', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/bank-transactions/{id}': {
      get: {
        tags: ['Banking'],
        summary: 'Get a bank transaction by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/bank-transactions/import': {
      post: {
        tags: ['Banking'],
        summary: 'Import a bank-statement CSV (date,description,amount[,reference,type]) into BankTransaction rows',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 400: { description: 'Malformed CSV' }, 404: { description: 'Bank account not found' } },
      },
    },
    '/bank-transactions/{id}/match': {
      post: {
        tags: ['Banking'],
        summary: 'Match a bank transaction to a payment/expense/journal entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Match target not found' }, 409: { description: 'Already matched' } },
      },
    },
    '/bank-transactions/{id}/unmatch': {
      post: {
        tags: ['Banking'],
        summary: 'Unmatch a previously matched bank transaction',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Not currently matched' } },
      },
    },
    '/reconciliations': {
      get: {
        tags: ['Banking'],
        summary: 'List reconciliations (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'bankAccountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['in_progress', 'completed'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['statementDate', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Banking'],
        summary: 'Start a reconciliation (snapshot statement balance vs current book balance)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Bank account not found' }, 409: { description: 'Already in progress' } },
      },
    },
    '/reconciliations/{id}': {
      get: {
        tags: ['Banking'],
        summary: 'Get a reconciliation by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/reconciliations/{id}/complete': {
      post: {
        tags: ['Banking'],
        summary: 'Complete a reconciliation (requires statement balance == book balance)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Not in progress' }, 422: { description: 'Balances do not match' } },
      },
    },
  },
  [{ name: 'Banking', description: 'Bank accounts, transactions, CSV import, matching, and reconciliation' }],
);
