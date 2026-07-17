import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { approvalsController } from './approvals.controller';
import {
  createApprovalRequestSchema,
  listApprovalRequestQuerySchema,
  listPendingQuerySchema,
  actOnStepSchema,
  rejectStepSchema,
  historyQuerySchema,
  idParamSchema,
} from './approvals.dto';
import { z } from 'zod';

export const approvalsRouter: Router = Router();

approvalsRouter.use(requireAuth, requireTenant);

const stepParamsSchema = z.object({ id: z.string().uuid(), stepId: z.string().uuid() });
const historyParamsSchema = z.object({
  entityType: z.enum(['invoice', 'bill', 'expense', 'journal']),
  entityId: z.string().uuid(),
});

approvalsRouter.get(
  '/',
  requirePermission('approval:read'),
  validate(listApprovalRequestQuerySchema, 'query'),
  asyncHandler(approvalsController.list),
);

// Pending-for-me MUST be registered before /:id so it isn't shadowed.
approvalsRouter.get(
  '/pending',
  requirePermission('approval:read'),
  validate(listPendingQuerySchema, 'query'),
  asyncHandler(approvalsController.listPending),
);

approvalsRouter.get(
  '/history/:entityType/:entityId',
  requirePermission('approval:read'),
  validate(historyParamsSchema, 'params'),
  validate(historyQuerySchema, 'query'),
  asyncHandler(approvalsController.historyForEntity),
);

approvalsRouter.get(
  '/:id',
  requirePermission('approval:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(approvalsController.get),
);

approvalsRouter.post(
  '/',
  requirePermission('approval:act'),
  validate(createApprovalRequestSchema),
  asyncHandler(approvalsController.create),
);

approvalsRouter.post(
  '/:id/steps/:stepId/approve',
  requirePermission('approval:act'),
  validate(stepParamsSchema, 'params'),
  validate(actOnStepSchema),
  asyncHandler(approvalsController.approveStep),
);

approvalsRouter.post(
  '/:id/steps/:stepId/reject',
  requirePermission('approval:act'),
  validate(stepParamsSchema, 'params'),
  validate(rejectStepSchema),
  asyncHandler(approvalsController.rejectStep),
);

registerOpenApiPaths(
  {
    '/approvals': {
      get: {
        tags: ['Approvals'],
        summary: 'List approval requests (paginated, filterable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
          { name: 'entityType', in: 'query', schema: { type: 'string', enum: ['invoice', 'bill', 'expense', 'journal'] } },
          { name: 'requestedBy', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Approvals'],
        summary: 'Create a multi-level approval request for an entity',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Entity not found' }, 409: { description: 'Already has a pending request' } },
      },
    },
    '/approvals/pending': {
      get: {
        tags: ['Approvals'],
        summary: 'List approval requests pending action from the authenticated user',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'entityType', in: 'query', schema: { type: 'string', enum: ['invoice', 'bill', 'expense', 'journal'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/approvals/history/{entityType}/{entityId}': {
      get: {
        tags: ['Approvals'],
        summary: 'Approval step history for a given entity',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entityType', in: 'path', required: true, schema: { type: 'string', enum: ['invoice', 'bill', 'expense', 'journal'] } },
          { name: 'entityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 404: { description: 'No approval request found' } },
      },
    },
    '/approvals/{id}': {
      get: {
        tags: ['Approvals'],
        summary: 'Get an approval request by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/approvals/{id}/steps/{stepId}/approve': {
      post: {
        tags: ['Approvals'],
        summary: 'Approve the current-level step; advances level or finalizes the request',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'stepId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 403: { description: 'Not the assigned approver' }, 409: { description: 'Not the current level' } },
      },
    },
    '/approvals/{id}/steps/{stepId}/reject': {
      post: {
        tags: ['Approvals'],
        summary: 'Reject the current-level step; halts the workflow',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'stepId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'OK' }, 403: { description: 'Not the assigned approver' }, 409: { description: 'Not the current level' } },
      },
    },
  },
  [{ name: 'Approvals', description: 'Multi-level approval workflow for invoices, bills, expenses & journal entries' }],
);
