import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { notificationsController } from './notifications.controller';
import {
  createNotificationSchema,
  listNotificationQuerySchema,
  idParamSchema,
} from './notifications.dto';

export const notificationsRouter: Router = Router();

// All notification routes require an authenticated tenant user.
notificationsRouter.use(requireAuth, requireTenant);

notificationsRouter.get(
  '/',
  requirePermission('notification:read'),
  validate(listNotificationQuerySchema, 'query'),
  asyncHandler(notificationsController.list),
);

// Static sub-routes declared before '/:id' so they aren't swallowed by it.
notificationsRouter.get(
  '/unread-count',
  requirePermission('notification:read'),
  asyncHandler(notificationsController.unreadCount),
);

notificationsRouter.post(
  '/read-all',
  requirePermission('notification:update'),
  asyncHandler(notificationsController.markAllRead),
);

notificationsRouter.get(
  '/:id',
  requirePermission('notification:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(notificationsController.get),
);

notificationsRouter.post(
  '/',
  requirePermission('notification:create'),
  validate(createNotificationSchema),
  asyncHandler(notificationsController.create),
);

notificationsRouter.post(
  '/:id/read',
  requirePermission('notification:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(notificationsController.markRead),
);

registerOpenApiPaths(
  {
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications visible to the current user (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Create a notification (tenant-wide if userId omitted)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Unread notification count for the current user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark every notification visible to the current user as read',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/notifications/{id}': {
      get: {
        tags: ['Notifications'],
        summary: 'Get a notification by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/notifications/{id}/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'Notifications', description: 'In-app notification center — list, unread count, mark read' }],
);
