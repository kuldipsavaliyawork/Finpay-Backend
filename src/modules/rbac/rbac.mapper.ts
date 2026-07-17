import type { Role, Permission, UserRole } from '@prisma/client';
import type { RoleWithPermissions } from './rbac.repository';

/** Role entity -> API DTO. */
export function toRoleApi(r: Role) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Role entity (with its permission grants included) -> API DTO. */
export function toRoleWithPermissionsApi(r: RoleWithPermissions) {
  return {
    ...toRoleApi(r),
    permissions: r.permissions.map((rp) => toPermissionApi(rp.permission)),
  };
}

/** Permission entity -> API DTO. */
export function toPermissionApi(p: Permission) {
  return {
    id: p.id,
    key: p.key,
    resource: p.resource,
    action: p.action,
    description: p.description,
  };
}

/** Membership role assignment (UserRole joined with Role) -> API DTO. */
export function toMembershipRoleApi(ur: UserRole & { role: Role }) {
  return {
    membershipId: ur.membershipId,
    roleId: ur.roleId,
    role: toRoleApi(ur.role),
  };
}
