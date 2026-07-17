import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { journalEntriesController } from './journal-entries.controller';
import {
  createJournalEntrySchema,
  updateJournalEntrySchema,
  reverseJournalEntrySchema,
  listJournalEntryQuerySchema,
  accountHistoryQuerySchema,
  trialBalanceQuerySchema,
  idParamSchema,
  accountIdParamSchema,
} from './journal-entries.dto';

export const journalEntriesRouter: Router = Router();

journalEntriesRouter.use(requireAuth, requireTenant);

// Trial balance passthrough (reuses reportsService — same numbers everywhere).
journalEntriesRouter.get(
  '/trial-balance',
  requirePermission('ledger:read'),
  validate(trialBalanceQuerySchema, 'query'),
  asyncHandler(journalEntriesController.trialBalance),
);

// GL account history.
journalEntriesRouter.get(
  '/accounts/:accountId/history',
  requirePermission('ledger:read'),
  validate(accountIdParamSchema, 'params'),
  validate(accountHistoryQuerySchema, 'query'),
  asyncHandler(journalEntriesController.accountHistory),
);

journalEntriesRouter.get(
  '/',
  requirePermission('ledger:read'),
  validate(listJournalEntryQuerySchema, 'query'),
  asyncHandler(journalEntriesController.list),
);

journalEntriesRouter.get(
  '/:id',
  requirePermission('ledger:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(journalEntriesController.get),
);

journalEntriesRouter.post(
  '/',
  requirePermission('ledger:create'),
  validate(createJournalEntrySchema),
  asyncHandler(journalEntriesController.create),
);

journalEntriesRouter.patch(
  '/:id',
  requirePermission('ledger:update'),
  validate(idParamSchema, 'params'),
  validate(updateJournalEntrySchema),
  asyncHandler(journalEntriesController.update),
);

// Posting is a money-moving mutation — idempotency-guarded.
journalEntriesRouter.post(
  '/:id/post',
  requirePermission('ledger:post'),
  validate(idParamSchema, 'params'),
  idempotency(),
  asyncHandler(journalEntriesController.post),
);

// Reversal creates a new posted mirror entry — idempotency-guarded.
journalEntriesRouter.post(
  '/:id/reverse',
  requirePermission('ledger:reverse'),
  validate(idParamSchema, 'params'),
  idempotency(),
  validate(reverseJournalEntrySchema),
  asyncHandler(journalEntriesController.reverse),
);

journalEntriesRouter.delete(
  '/:id',
  requirePermission('ledger:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(journalEntriesController.remove),
);

registerOpenApiPaths(
  {
    '/journal-entries': {
      get: {
        tags: ['Journal Entries'],
        summary: 'List journal entries (paginated, filterable by date range, account, status, source)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'posted', 'reversed'] } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['number', 'date', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Journal Entries'],
        summary: 'Create a draft journal entry (validated: debits must equal credits)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 422: { description: 'Not balanced' } },
      },
    },
    '/journal-entries/trial-balance': {
      get: {
        tags: ['Journal Entries'],
        summary: 'Trial balance passthrough (same computation as /reports/trial-balance)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/journal-entries/accounts/{accountId}/history': {
      get: {
        tags: ['Journal Entries'],
        summary: 'GL account history — paginated posted journal lines with running balance',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'accountId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'Account not found' } },
      },
    },
    '/journal-entries/{id}': {
      get: {
        tags: ['Journal Entries'],
        summary: 'Get a journal entry by id (with lines)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Journal Entries'],
        summary: 'Update a draft journal entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 422: { description: 'Only drafts editable / not balanced' } },
      },
      delete: {
        tags: ['Journal Entries'],
        summary: 'Delete a draft journal entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 422: { description: 'Only drafts deletable' } },
      },
    },
    '/journal-entries/{id}/post': {
      post: {
        tags: ['Journal Entries'],
        summary: 'Post a draft journal entry (immutable once posted)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 409: { description: 'Already posted or reversed' } },
      },
    },
    '/journal-entries/{id}/reverse': {
      post: {
        tags: ['Journal Entries'],
        summary: 'Reverse a posted journal entry (creates a balanced mirror entry)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 201: { description: 'Created (reversal entry)' }, 422: { description: 'Only posted entries reversible' } },
      },
    },
  },
  [{ name: 'Journal Entries', description: 'General ledger — journal entries API layer on top of ledger.service' }],
);
