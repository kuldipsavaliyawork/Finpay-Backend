import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { auditController } from './audit.controller';
import { listAuditQuerySchema, exportAuditQuerySchema, idParamSchema } from './audit.dto';

export const auditRouter: Router = Router();

// All audit routes require an authenticated tenant user. Read-only module —
// AuditLog rows are written exclusively via AuditService.record(...) inside
// other modules' services, never through this router.
auditRouter.use(requireAuth, requireTenant);

// '/export' is declared before '/:id' so it isn't swallowed by the id-param route.
auditRouter.get(
  '/export',
  requirePermission('audit:read'),
  validate(exportAuditQuerySchema, 'query'),
  asyncHandler(auditController.exportCsv),
);

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  validate(listAuditQuerySchema, 'query'),
  asyncHandler(auditController.list),
);

auditRouter.get(
  '/:id',
  requirePermission('audit:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(auditController.get),
);

registerOpenApiPaths(
  {
    '/audit': {
      get: {
        tags: ['Audit'],
        summary: 'List audit log entries (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'module', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'entityId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/audit/export': {
      get: {
        tags: ['Audit'],
        summary: 'Export audit log entries as CSV',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'module', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'entityId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
        },
      },
    },
    '/audit/{id}': {
      get: {
        tags: ['Audit'],
        summary: 'Get a single audit log entry (includes before/after)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Audit', description: 'Read-only audit trail across all modules' }],
);
