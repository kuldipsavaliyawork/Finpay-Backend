import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { depositAccountsController, transfersController } from './deposit-accounts.controller';
import {
  openDepositAccountSchema,
  updateDepositAccountSchema,
  listDepositAccountQuerySchema,
  listDepositTransactionQuerySchema,
  createTransferSchema,
  listTransferQuerySchema,
  idParamSchema,
} from './deposit-accounts.dto';

/**
 * Deposit accounts router — mount at /deposit-accounts.
 */
export const depositAccountsRouter: Router = Router();
depositAccountsRouter.use(requireAuth, requireTenant);

depositAccountsRouter.get(
  '/',
  requirePermission('deposit-account:read'),
  validate(listDepositAccountQuerySchema, 'query'),
  asyncHandler(depositAccountsController.list),
);

depositAccountsRouter.get(
  '/:id',
  requirePermission('deposit-account:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(depositAccountsController.get),
);

depositAccountsRouter.get(
  '/:id/transactions',
  requirePermission('deposit-account:read'),
  validate(idParamSchema, 'params'),
  validate(listDepositTransactionQuerySchema, 'query'),
  asyncHandler(depositAccountsController.transactions),
);

// Opening an account may seed an opening balance — idempotency-guarded.
depositAccountsRouter.post(
  '/',
  requirePermission('deposit-account:manage'),
  idempotency(),
  validate(openDepositAccountSchema),
  asyncHandler(depositAccountsController.open),
);

depositAccountsRouter.patch(
  '/:id',
  requirePermission('deposit-account:manage'),
  validate(idParamSchema, 'params'),
  validate(updateDepositAccountSchema),
  asyncHandler(depositAccountsController.updateStatus),
);

/**
 * Transfers router — mount at /transfers.
 */
export const transfersRouter: Router = Router();
transfersRouter.use(requireAuth, requireTenant);

transfersRouter.get(
  '/',
  requirePermission('transfer:read'),
  validate(listTransferQuerySchema, 'query'),
  asyncHandler(transfersController.list),
);

transfersRouter.get(
  '/:id',
  requirePermission('transfer:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(transfersController.get),
);

// A transfer moves money — idempotency-guarded so retries/double-clicks are safe.
transfersRouter.post(
  '/',
  requirePermission('transfer:manage'),
  idempotency(),
  validate(createTransferSchema),
  asyncHandler(transfersController.create),
);

registerOpenApiPaths(
  {
    '/deposit-accounts': {
      get: {
        tags: ['Deposit Accounts'],
        summary: 'List customer deposit accounts (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['savings', 'current'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'dormant', 'frozen', 'closed'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['accountNumber', 'balance', 'createdAt', 'openedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Deposit Accounts'],
        summary: 'Open a deposit account for a customer (generates an account number)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Customer not found' } },
      },
    },
    '/deposit-accounts/{id}': {
      get: {
        tags: ['Deposit Accounts'],
        summary: 'Get a deposit account by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Deposit Accounts'],
        summary: 'Change account status (active | dormant | frozen | closed)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' }, 422: { description: 'Illegal transition (e.g. close with non-zero balance)' } },
      },
    },
    '/deposit-accounts/{id}/transactions': {
      get: {
        tags: ['Deposit Accounts'],
        summary: 'Account statement — list deposit transactions for an account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Account not found' } },
      },
    },
    '/transfers': {
      get: {
        tags: ['Deposit Accounts'],
        summary: 'List internal transfers (paginated; filter by accountId matches either leg)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'amount'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Deposit Accounts'],
        summary: 'Make an internal transfer between two deposit accounts (atomic debit + credit)',
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'Created' },
          404: { description: 'Account not found' },
          422: { description: 'Inactive account, currency mismatch, or insufficient balance' },
        },
      },
    },
    '/transfers/{id}': {
      get: {
        tags: ['Deposit Accounts'],
        summary: 'Get a transfer by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Deposit Accounts', description: 'Customer deposit accounts, statements, and internal transfers' }],
);
