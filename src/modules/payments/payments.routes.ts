import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { paymentsController } from './payments.controller';
import {
  createPaymentSchema,
  listPaymentQuerySchema,
  idParamSchema,
} from './payments.dto';

export const paymentsRouter: Router = Router();

// All payment routes require an authenticated tenant user.
paymentsRouter.use(requireAuth, requireTenant);

paymentsRouter.get(
  '/',
  requirePermission('payment:read'),
  validate(listPaymentQuerySchema, 'query'),
  asyncHandler(paymentsController.list),
);

paymentsRouter.get(
  '/:id',
  requirePermission('payment:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(paymentsController.get),
);

// Recording a payment allocates to invoices/bills and posts to the ledger —
// idempotency-guarded (money-moving mutation).
paymentsRouter.post(
  '/',
  requirePermission('payment:create'),
  idempotency(),
  validate(createPaymentSchema),
  asyncHandler(paymentsController.create),
);

// Voiding a payment reverses allocations + posts a reversing ledger entry.
paymentsRouter.delete(
  '/:id',
  requirePermission('payment:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(paymentsController.remove),
);

registerOpenApiPaths(
  {
    '/payments': {
      get: {
        tags: ['Payments'],
        summary: 'List payments (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['inbound', 'outbound'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'completed', 'failed'] } },
          { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['number', 'date', 'amount', 'createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Payments'],
        summary: 'Record a payment (inbound receipt or outbound disbursement), allocate to invoices/bills, and post to the ledger',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: {
          201: { description: 'Created' },
          404: { description: 'Customer/vendor/bank account/invoice/bill not found' },
          422: { description: 'Allocation totals do not match payment amount, or document not in a payable state' },
          409: { description: 'Idempotency-Key reused with a different request' },
        },
      },
    },
    '/payments/{id}': {
      get: {
        tags: ['Payments'],
        summary: 'Get a payment by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Payments'],
        summary: 'Void a completed payment — reverses allocations and posts a reversing ledger entry',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' }, 422: { description: 'Only completed payments can be voided' } },
      },
    },
  },
  [{ name: 'Payments', description: 'Inbound receipts & outbound disbursements — allocation + GL posting' }],
);
