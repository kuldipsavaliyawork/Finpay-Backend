import { Prisma, type PrismaClient, type Role, type Permission, type Membership, type UserRole } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListRoleArgs {
  skip: number;
  take: number;
  q?: string;
  isSystem?: boolean;
  sortBy?: 'name' | 'key' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

function roleWhere(tenantId: string, a: { q?: string; isSystem?: boolean }): Prisma.RoleWhereInput {
  const where: Prisma.RoleWhereInput = { tenantId };
  if (a.isSystem !== undefined) where.isSystem = a.isSystem;
  if (a.q) {
    where.OR = [
      { name: { contains: a.q, mode: 'insensitive' } },
      { key: { contains: a.q, mode: 'insensitive' } },
      { description: { contains: a.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export type RoleWithPermissions = Role & { permissions: (Prisma.RolePermissionGetPayload<{ include: { permission: true } }>)[] };

/**
 * RBAC repository — Prisma access for Role/Permission/RolePermission/UserRole.
 * Role rows are tenant-scoped (`Role.tenantId`); Permission is a global,
 * tenant-agnostic catalog (no tenantId column) so permission reads are never
 * tenant-filtered. Membership/UserRole rows are scoped via the owning
 * Membership's tenantId.
 */
export const rbacRepository = {
  // ── Roles ──────────────────────────────────────────────────────────────
  findRoleById(tenantId: string, id: string, db: Db = prisma): Promise<Role | null> {
    return db.role.findFirst({ where: { id, tenantId } });
  },

  findRoleByIdWithPermissions(tenantId: string, id: string, db: Db = prisma): Promise<RoleWithPermissions | null> {
    return db.role.findFirst({
      where: { id, tenantId },
      include: { permissions: { include: { permission: true } } },
    });
  },

  findRoleByKey(tenantId: string, key: string, db: Db = prisma): Promise<Role | null> {
    return db.role.findFirst({ where: { tenantId, key } });
  },

  list(tenantId: string, a: ListRoleArgs, db: Db = prisma): Promise<Role[]> {
    const where = roleWhere(tenantId, a);
    return db.role.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
    });
  },

  count(tenantId: string, a: { q?: string; isSystem?: boolean }, db: Db = prisma): Promise<number> {
    return db.role.count({ where: roleWhere(tenantId, a) });
  },

  create(
    tenantId: string,
    data: { key: string; name: string; description?: string | null },
    db: Db = prisma,
  ): Promise<Role> {
    return db.role.create({
      data: {
        tenantId,
        key: data.key,
        name: data.name,
        description: data.description ?? null,
        isSystem: false,
      },
    });
  },

  update(tenantId: string, id: string, data: Prisma.RoleUpdateInput, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.role.updateMany({ where: { id, tenantId }, data });
  },

  /** Hard-delete a role (roles have no soft-delete column). Cascades RolePermission/UserRole rows. */
  delete(tenantId: string, id: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.role.deleteMany({ where: { id, tenantId } });
  },

  countMembershipsForRole(tenantId: string, roleId: string, db: Db = prisma): Promise<number> {
    return db.userRole.count({ where: { roleId, role: { tenantId } } });
  },

  // ── Permission catalog (global, not tenant-scoped) ───────────────────────
  listPermissions(a: { skip: number; take: number; q?: string; resource?: string }, db: Db = prisma): Promise<Permission[]> {
    const where: Prisma.PermissionWhereInput = {};
    if (a.resource) where.resource = a.resource;
    if (a.q) {
      where.OR = [
        { key: { contains: a.q, mode: 'insensitive' } },
        { resource: { contains: a.q, mode: 'insensitive' } },
        { action: { contains: a.q, mode: 'insensitive' } },
        { description: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.permission.findMany({ where, skip: a.skip, take: a.take, orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  },

  countPermissions(a: { q?: string; resource?: string }, db: Db = prisma): Promise<number> {
    const where: Prisma.PermissionWhereInput = {};
    if (a.resource) where.resource = a.resource;
    if (a.q) {
      where.OR = [
        { key: { contains: a.q, mode: 'insensitive' } },
        { resource: { contains: a.q, mode: 'insensitive' } },
        { action: { contains: a.q, mode: 'insensitive' } },
        { description: { contains: a.q, mode: 'insensitive' } },
      ];
    }
    return db.permission.count({ where });
  },

  findPermissionsByKeys(keys: string[], db: Db = prisma): Promise<Permission[]> {
    if (keys.length === 0) return Promise.resolve([]);
    return db.permission.findMany({ where: { key: { in: keys } } });
  },

  // ── Role <-> Permission assignment ───────────────────────────────────────
  clearRolePermissions(roleId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.rolePermission.deleteMany({ where: { roleId } });
  },

  addRolePermissions(roleId: string, permissionIds: string[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    if (permissionIds.length === 0) return Promise.resolve({ count: 0 });
    return db.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  },

  // ── Membership (tenant-scoped via the owning tenant) ─────────────────────
  findMembershipById(tenantId: string, membershipId: string, db: Db = prisma): Promise<Membership | null> {
    return db.membership.findFirst({ where: { id: membershipId, tenantId } });
  },

  findMembershipWithRoles(tenantId: string, membershipId: string, db: Db = prisma) {
    return db.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: { roles: { include: { role: true } } },
    });
  },

  findUserRole(membershipId: string, roleId: string, db: Db = prisma): Promise<UserRole | null> {
    return db.userRole.findUnique({ where: { membershipId_roleId: { membershipId, roleId } } });
  },

  assignRoleToMembership(membershipId: string, roleId: string, db: Db = prisma): Promise<UserRole> {
    return db.userRole.create({ data: { membershipId, roleId } });
  },

  removeRoleFromMembership(membershipId: string, roleId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.userRole.deleteMany({ where: { membershipId, roleId } });
  },
};
