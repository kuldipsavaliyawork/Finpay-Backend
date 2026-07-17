import crypto from 'node:crypto';
import { prisma } from '../../infrastructure/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { hashPassword } from '../../common/security/password';
import type { Ctx } from '../../common/http';
import { usersRepository as repo } from './users.repository';
import type { InviteUserInput, UpdateMembershipInput } from './users.dto';
import type { Paging } from '../../common/pagination/pagination';

export const usersService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      q?: string;
      status?: 'active' | 'invited' | 'disabled';
      roleKey?: string;
      sortBy?: 'createdAt' | 'updatedAt' | 'email' | 'firstName' | 'lastName';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, membershipId: string) {
    const membership = await repo.findById(tenantId, membershipId);
    if (!membership) throw new NotFoundError('User not found');
    return membership;
  },

  /**
   * Invite a user into this tenant. If the email already belongs to a global
   * User, that identity is reused (a new Membership + role grants are created
   * for this tenant); otherwise a brand-new User is created with status
   * "invited" and a random, unusable-until-reset password hash. Roles are
   * resolved by key against this tenant's Role rows and assigned via UserRole.
   */
  async invite(ctx: Ctx, input: InviteUserInput) {
    const roles = await repo.findRolesByKeys(ctx.tenantId, input.roleKeys);
    const foundKeys = new Set(roles.map((r) => r.key));
    const missing = input.roleKeys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestError('Unknown role key(s)', { roleKeys: missing });
    }

    let user = await repo.findUserByEmail(input.email);

    if (user) {
      const existingMembership = await repo.findByUserId(ctx.tenantId, user.id);
      if (existingMembership) {
        throw new ConflictError('User is already a member of this tenant', { email: input.email });
      }
    }

    const membership = await prisma.$transaction(async (tx) => {
      if (!user) {
        // Random, never-communicated password; the user sets their own via the
        // password-reset / invite-acceptance flow (auth module), not here.
        const randomPassword = crypto.randomBytes(24).toString('hex');
        const passwordHash = await hashPassword(randomPassword);
        user = await repo.createUser(
          {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'invited',
          },
          tx,
        );
      }

      const created = await repo.createMembership(
        ctx.tenantId,
        { userId: user.id, status: 'invited', invitedBy: ctx.userId },
        tx,
      );

      await repo.replaceMembershipRoles(
        created.id,
        roles.map((r) => r.id),
        tx,
      );

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'invite',
          module: 'users',
          entityType: 'membership',
          entityId: created.id,
          after: { email: user.email, roleKeys: input.roleKeys },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return created;
    });

    return this.get(ctx.tenantId, membership.id);
  },

  /** Update the underlying User's profile fields (name) for this membership. */
  async updateProfile(ctx: Ctx, membershipId: string, input: UpdateMembershipInput) {
    const before = await this.get(ctx.tenantId, membershipId);

    const data: { firstName?: string; lastName?: string } = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;

    if (Object.keys(data).length > 0) {
      await repo.updateUser(before.user.id, data);
    }
    const after = await this.get(ctx.tenantId, membershipId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'users',
      entityType: 'membership',
      entityId: membershipId,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  /** Enable (reactivate) a disabled/invited membership. */
  async enable(ctx: Ctx, membershipId: string) {
    const before = await this.get(ctx.tenantId, membershipId);
    await repo.updateMembershipStatus(ctx.tenantId, membershipId, 'active');
    const after = await this.get(ctx.tenantId, membershipId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'enable',
      module: 'users',
      entityType: 'membership',
      entityId: membershipId,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  /** Disable a membership — revokes tenant access without deleting the user. */
  async disable(ctx: Ctx, membershipId: string) {
    const before = await this.get(ctx.tenantId, membershipId);
    if (before.userId === ctx.userId) {
      throw new BadRequestError('You cannot disable your own membership');
    }
    await repo.updateMembershipStatus(ctx.tenantId, membershipId, 'disabled');
    const after = await this.get(ctx.tenantId, membershipId);

    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'disable',
      module: 'users',
      entityType: 'membership',
      entityId: membershipId,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  /** Replace the set of roles assigned to a membership. */
  async assignRoles(ctx: Ctx, membershipId: string, roleKeys: string[]) {
    const before = await this.get(ctx.tenantId, membershipId);

    const roles = await repo.findRolesByKeys(ctx.tenantId, roleKeys);
    const foundKeys = new Set(roles.map((r) => r.key));
    const missing = roleKeys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestError('Unknown role key(s)', { roleKeys: missing });
    }

    await prisma.$transaction(async (tx) => {
      await repo.replaceMembershipRoles(
        membershipId,
        roles.map((r) => r.id),
        tx,
      );
      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'assign_roles',
          module: 'users',
          entityType: 'membership',
          entityId: membershipId,
          before: { roleKeys: before.roles.map((ur) => ur.role.key) },
          after: { roleKeys },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, membershipId);
  },
};
