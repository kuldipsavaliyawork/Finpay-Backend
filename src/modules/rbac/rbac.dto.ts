import { z } from 'zod';

/**
 * Zod request schemas for the RBAC module (roles, permission catalog,
 * role-permission assignment, membership role assignment).
 */

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, 'key may only contain lowercase letters, numbers, underscore, hyphen'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const listRoleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  isSystem: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'key', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListRoleQuery = z.infer<typeof listRoleQuerySchema>;

export const listPermissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  // Catalog is ~90 keys today; allow a full pull for the permissions matrix UI.
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  q: z.string().trim().optional(),
  resource: z.string().trim().optional(),
});
export type ListPermissionQuery = z.infer<typeof listPermissionQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const membershipIdParamSchema = z.object({ membershipId: z.string().uuid() });
export type MembershipIdParam = z.infer<typeof membershipIdParamSchema>;

/** Replace the full permission set on a role. */
export const setRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string().trim().min(1)).max(500),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

/** Assign a role to a membership. */
export const assignMembershipRoleSchema = z.object({
  roleId: z.string().uuid(),
});
export type AssignMembershipRoleInput = z.infer<typeof assignMembershipRoleSchema>;

export const membershipRoleParamSchema = z.object({
  membershipId: z.string().uuid(),
  roleId: z.string().uuid(),
});
export type MembershipRoleParam = z.infer<typeof membershipRoleParamSchema>;
