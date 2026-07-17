import { prisma } from '../../infrastructure/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { PERMISSION_KEYS } from '../../config/constants';
import type { Ctx } from '../../common/http';
import { rbacRepository as repo } from './rbac.repository';
import type { CreateRoleInput, UpdateRoleInput } from './rbac.dto';
import type { Paging } from '../../common/pagination/pagination';

const VALID_PERMISSION_KEYS = new Set(PERMISSION_KEYS);

export const rbacService = {
  // ── Roles ────────────────────────────────────────────────────────────────
  async list(
    tenantId: string,
    paging: Paging,
    filters: { q?: string; isSystem?: boolean; sortBy?: 'name' | 'key' | 'createdAt' | 'updatedAt'; sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const role = await repo.findRoleById(tenantId, id);
    if (!role) throw new NotFoundError('Role not found');
    return role;
  },

  async getWithPermissions(tenantId: string, id: string) {
    const role = await repo.findRoleByIdWithPermissions(tenantId, id);
    if (!role) throw new NotFoundError('Role not found');
    return role;
  },

  async create(ctx: Ctx, input: CreateRoleInput) {
    const dupe = await repo.findRoleByKey(ctx.tenantId, input.key);
    if (dupe) throw new ConflictError('A role with this key already exists', { key: input.key });

    return prisma.$transaction(async (tx) => {
      const role = await repo.create(
        ctx.tenantId,
        { key: input.key, name: input.name, description: input.description ?? null },
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'rbac',
          entityType: 'role',
          entityId: role.id,
          after: role,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return role;
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateRoleInput) {
    const before = await this.get(ctx.tenantId, id);

    await repo.update(ctx.tenantId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
    const after = await this.get(ctx.tenantId, id);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'rbac',
      entityType: 'role',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    // System roles (owner/admin/accountant/approver/viewer, seeded at tenant
    // registration) are load-bearing for the RBAC bootstrap and must never be
    // deleted, regardless of whether they currently have members assigned.
    if (before.isSystem) {
      throw new BadRequestError('System roles cannot be deleted', { roleId: id, key: before.key });
    }

    await repo.delete(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'delete',
      module: 'rbac',
      entityType: 'role',
      entityId: id,
      before,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  // ── Permission catalog (read-only, global) ────────────────────────────────
  async listPermissions(paging: Paging, filters: { q?: string; resource?: string }) {
    const [items, total] = await Promise.all([
      repo.listPermissions({ skip: paging.skip, take: paging.take, ...filters }),
      repo.countPermissions(filters),
    ]);
    return [items, total] as const;
  },

  // ── Set the full permission grant set on a role ───────────────────────────
  async setRolePermissions(ctx: Ctx, roleId: string, permissionKeys: string[]) {
    const role = await this.get(ctx.tenantId, roleId);

    const uniqueKeys = [...new Set(permissionKeys)];
    const unknown = uniqueKeys.filter((k) => !VALID_PERMISSION_KEYS.has(k));
    if (unknown.length > 0) {
      throw new BadRequestError('Unknown permission key(s)', { unknown });
    }

    const before = await repo.findRoleByIdWithPermissions(ctx.tenantId, roleId);
    const permissions = await repo.findPermissionsByKeys(uniqueKeys);

    await prisma.$transaction(async (tx) => {
      await repo.clearRolePermissions(role.id, tx);
      await repo.addRolePermissions(
        role.id,
        permissions.map((p) => p.id),
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'update',
          module: 'rbac',
          entityType: 'role_permissions',
          entityId: role.id,
          before: before?.permissions.map((rp) => rp.permission.key) ?? [],
          after: uniqueKeys,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.getWithPermissions(ctx.tenantId, roleId);
  },

  // ── Membership role assignment ────────────────────────────────────────────
  async assignRoleToMembership(ctx: Ctx, membershipId: string, roleId: string) {
    const membership = await repo.findMembershipById(ctx.tenantId, membershipId);
    if (!membership) throw new NotFoundError('Membership not found');

    const role = await this.get(ctx.tenantId, roleId);

    const existing = await repo.findUserRole(membershipId, role.id);
    if (existing) throw new ConflictError('Role already assigned to this membership', { membershipId, roleId });

    const userRole = await repo.assignRoleToMembership(membershipId, role.id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'assign_role',
      module: 'rbac',
      entityType: 'membership',
      entityId: membershipId,
      after: { membershipId, roleId: role.id, roleKey: role.key },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { ...userRole, role };
  },

  async removeRoleFromMembership(ctx: Ctx, membershipId: string, roleId: string) {
    const membership = await repo.findMembershipById(ctx.tenantId, membershipId);
    if (!membership) throw new NotFoundError('Membership not found');

    const role = await this.get(ctx.tenantId, roleId);

    const existing = await repo.findUserRole(membershipId, role.id);
    if (!existing) throw new NotFoundError('Role is not assigned to this membership');

    await repo.removeRoleFromMembership(membershipId, role.id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'remove_role',
      module: 'rbac',
      entityType: 'membership',
      entityId: membershipId,
      before: { membershipId, roleId: role.id, roleKey: role.key },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  async listMembershipRoles(tenantId: string, membershipId: string) {
    const membership = await repo.findMembershipWithRoles(tenantId, membershipId);
    if (!membership) throw new NotFoundError('Membership not found');
    return membership.roles;
  },
};
