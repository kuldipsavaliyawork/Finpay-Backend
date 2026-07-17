import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { usersController } from './users.controller';
import {
  inviteUserSchema,
  updateMembershipSchema,
  assignRolesSchema,
  listUserQuerySchema,
  idParamSchema,
} from './users.dto';

export const usersRouter: Router = Router();

// All users routes require an authenticated tenant user.
usersRouter.use(requireAuth, requireTenant);

usersRouter.get(
  '/',
  requirePermission('user:read'),
  validate(listUserQuerySchema, 'query'),
  asyncHandler(usersController.list),
);

usersRouter.get(
  '/:id',
  requirePermission('user:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(usersController.get),
);

usersRouter.post(
  '/invite',
  requirePermission('user:create'),
  idempotency(),
  validate(inviteUserSchema),
  asyncHandler(usersController.invite),
);

usersRouter.patch(
  '/:id',
  requirePermission('user:update'),
  validate(idParamSchema, 'params'),
  validate(updateMembershipSchema),
  asyncHandler(usersController.updateProfile),
);

usersRouter.post(
  '/:id/enable',
  requirePermission('user:update'),
  validate(idParamSchema, 'params'),
  asyncHandler(usersController.enable),
);

usersRouter.post(
  '/:id/disable',
  requirePermission('user:delete'),
  validate(idParamSchema, 'params'),
  asyncHandler(usersController.disable),
);

usersRouter.post(
  '/:id/roles',
  requirePermission('role:manage'),
  validate(idParamSchema, 'params'),
  validate(assignRolesSchema),
  asyncHandler(usersController.assignRoles),
);

registerOpenApiPaths(
  {
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (memberships) in the current tenant',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'invited', 'disabled'] } },
          { name: 'roleKey', in: 'query', schema: { type: 'string' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: { type: 'string', enum: ['createdAt', 'updatedAt', 'email', 'firstName', 'lastName'] },
          },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/users/invite': {
      post: {
        tags: ['Users'],
        summary: 'Invite a new user into the tenant (creates User + Membership + role grants)',
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'Created' },
          400: { description: 'Unknown role key(s)' },
          409: { description: 'User already a member of this tenant' },
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get a user (membership) by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Users'],
        summary: "Update a user's profile fields (first/last name)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/users/{id}/enable': {
      post: {
        tags: ['Users'],
        summary: 'Enable (reactivate) a membership',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/users/{id}/disable': {
      post: {
        tags: ['Users'],
        summary: 'Disable a membership (revokes tenant access without deleting the user)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'OK' },
          400: { description: 'Cannot disable your own membership' },
          404: { description: 'Not found' },
        },
      },
    },
    '/users/{id}/roles': {
      post: {
        tags: ['Users'],
        summary: 'Replace the roles assigned to a membership',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'OK' },
          400: { description: 'Unknown role key(s)' },
          404: { description: 'Not found' },
        },
      },
    },
  },
  [{ name: 'Users', description: 'Tenant users — memberships, invitations, role assignment' }],
);
