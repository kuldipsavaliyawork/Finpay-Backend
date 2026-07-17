import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { rbacController } from './rbac.controller';
import {
  createRoleSchema,
  updateRoleSchema,
  listRoleQuerySchema,
  listPermissionQuerySchema,
  idParamSchema,
  membershipIdParamSchema,
  membershipRoleParamSchema,
  setRolePermissionsSchema,
  assignMembershipRoleSchema,
} from './rbac.dto';

export const rbacRouter: Router = Router();

// All RBAC routes require an authenticated tenant user.
rbacRouter.use(requireAuth, requireTenant);

// ── Permission catalog (read-only) ──────────────────────────────────────────
// Declared before '/:id' so 'permissions' isn't swallowed by the id-param route.
rbacRouter.get(
  '/permissions',
  requirePermission('role:read'),
  validate(listPermissionQuerySchema, 'query'),
  asyncHandler(rbacController.listPermissions),
);

// ── Roles ────────────────────────────────────────────────────────────────
rbacRouter.get(
  '/roles',
  requirePermission('role:read'),
  validate(listRoleQuerySchema, 'query'),
  asyncHandler(rbacController.list),
);

rbacRouter.get(
  '/roles/:id',
  requirePermission('role:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(rbacController.get),
);

rbacRouter.post(
  '/roles',
  requirePermission('role:manage'),
  validate(createRoleSchema),
  asyncHandler(rbacController.create),
);

rbacRouter.patch(
  '/roles/:id',
  requirePermission('role:manage'),
  validate(idParamSchema, 'params'),
  validate(updateRoleSchema),
  asyncHandler(rbacController.update),
);

rbacRouter.delete(
  '/roles/:id',
  requirePermission('role:manage'),
  validate(idParamSchema, 'params'),
  asyncHandler(rbacController.remove),
);

rbacRouter.put(
  '/roles/:id/permissions',
  requirePermission('role:manage'),
  validate(idParamSchema, 'params'),
  validate(setRolePermissionsSchema),
  asyncHandler(rbacController.setRolePermissions),
);

// ── Membership role assignment ────────────────────────────────────────────
rbacRouter.get(
  '/memberships/:membershipId/roles',
  requirePermission('role:read'),
  validate(membershipIdParamSchema, 'params'),
  asyncHandler(rbacController.listMembershipRoles),
);

rbacRouter.post(
  '/memberships/:membershipId/roles',
  requirePermission('role:manage'),
  validate(membershipIdParamSchema, 'params'),
  validate(assignMembershipRoleSchema),
  asyncHandler(rbacController.assignMembershipRole),
);

rbacRouter.delete(
  '/memberships/:membershipId/roles/:roleId',
  requirePermission('role:manage'),
  validate(membershipRoleParamSchema, 'params'),
  asyncHandler(rbacController.removeMembershipRole),
);

registerOpenApiPaths(
  {
    '/rbac/permissions': {
      get: {
        tags: ['RBAC'],
        summary: 'List the permission catalog (paginated, filterable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'resource', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/rbac/roles': {
      get: {
        tags: ['RBAC'],
        summary: 'List roles (paginated, filterable, sortable)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'isSystem', in: 'query', schema: { type: 'boolean' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'key', 'createdAt', 'updatedAt'] } },
          { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['RBAC'],
        summary: 'Create a custom role',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate role key' } },
      },
    },
    '/rbac/roles/{id}': {
      get: {
        tags: ['RBAC'],
        summary: 'Get a role by id (with its permission grants)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['RBAC'],
        summary: 'Update a role (name/description)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['RBAC'],
        summary: 'Delete a role (system roles cannot be deleted)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' }, 400: { description: 'System role' }, 404: { description: 'Not found' } },
      },
    },
    '/rbac/roles/{id}/permissions': {
      put: {
        tags: ['RBAC'],
        summary: 'Replace the full permission set on a role',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 400: { description: 'Unknown permission key(s)' }, 404: { description: 'Not found' } },
      },
    },
    '/rbac/memberships/{membershipId}/roles': {
      get: {
        tags: ['RBAC'],
        summary: 'List roles assigned to a membership',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'membershipId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
      post: {
        tags: ['RBAC'],
        summary: 'Assign a role to a membership',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'membershipId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 201: { description: 'Created' }, 404: { description: 'Not found' }, 409: { description: 'Already assigned' } },
      },
    },
    '/rbac/memberships/{membershipId}/roles/{roleId}': {
      delete: {
        tags: ['RBAC'],
        summary: 'Remove a role from a membership',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'membershipId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'roleId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 204: { description: 'No Content' }, 404: { description: 'Not found' } },
      },
    },
  },
  [{ name: 'RBAC', description: 'Roles, permission catalog, role-permission and membership-role assignment' }],
);
