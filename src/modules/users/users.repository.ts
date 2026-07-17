import { Prisma, type PrismaClient, type Membership, type User, type Role } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/** Membership + its User + assigned roles — the shape the mapper renders. */
export type MembershipWithUserAndRoles = Membership & {
  user: User;
  roles: { role: Role }[];
};

export interface ListMembershipArgs {
  skip: number;
  take: number;
  q?: string;
  status?: 'active' | 'invited' | 'disabled';
  roleKey?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'email' | 'firstName' | 'lastName';
  sortDir?: 'asc' | 'desc';
}

const membershipInclude = {
  user: true,
  roles: { include: { role: true } },
} satisfies Prisma.MembershipInclude;

function membershipWhere(
  tenantId: string,
  a: { q?: string; status?: string; roleKey?: string },
): Prisma.MembershipWhereInput {
  const where: Prisma.MembershipWhereInput = { tenantId };
  if (a.status) where.status = a.status;
  if (a.roleKey) where.roles = { some: { role: { key: a.roleKey } } };
  if (a.q) {
    where.user = {
      OR: [
        { email: { contains: a.q, mode: 'insensitive' } },
        { firstName: { contains: a.q, mode: 'insensitive' } },
        { lastName: { contains: a.q, mode: 'insensitive' } },
      ],
    };
  }
  return where;
}

/**
 * Users repository — all Prisma access for the users module. "Users within a
 * tenant" are modeled as Membership rows (tenant-scoped by construction);
 * User is a global identity looked up/created alongside the Membership.
 */
export const usersRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<MembershipWithUserAndRoles | null> {
    return db.membership.findFirst({ where: { id, tenantId }, include: membershipInclude });
  },

  findByUserId(tenantId: string, userId: string, db: Db = prisma): Promise<MembershipWithUserAndRoles | null> {
    return db.membership.findFirst({ where: { tenantId, userId }, include: membershipInclude });
  },

  list(tenantId: string, a: ListMembershipArgs, db: Db = prisma): Promise<MembershipWithUserAndRoles[]> {
    const where = membershipWhere(tenantId, a);
    // Sorting by user fields requires ordering through the relation.
    const orderBy: Prisma.MembershipOrderByWithRelationInput =
      a.sortBy === 'email' || a.sortBy === 'firstName' || a.sortBy === 'lastName'
        ? { user: { [a.sortBy]: a.sortDir ?? 'asc' } }
        : { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' };
    return db.membership.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy,
      include: membershipInclude,
    });
  },

  count(tenantId: string, a: { q?: string; status?: string; roleKey?: string }, db: Db = prisma): Promise<number> {
    return db.membership.count({ where: membershipWhere(tenantId, a) });
  },

  // ── Global User lookups (identity is not tenant-scoped) ───────────────────
  findUserByEmail(email: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  createUser(data: Prisma.UserCreateInput, db: Db = prisma): Promise<User> {
    return db.user.create({ data });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput, db: Db = prisma): Promise<User> {
    return db.user.update({ where: { id }, data });
  },

  // ── Membership ──────────────────────────────────────────────────────────
  createMembership(
    tenantId: string,
    data: { userId: string; status?: string; invitedBy?: string | null },
    db: Db = prisma,
  ): Promise<Membership> {
    return db.membership.create({
      data: {
        tenantId,
        userId: data.userId,
        status: data.status ?? 'invited',
        invitedBy: data.invitedBy ?? null,
      },
    });
  },

  updateMembershipStatus(tenantId: string, id: string, status: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.membership.updateMany({ where: { id, tenantId }, data: { status } });
  },

  // ── Roles (tenant-scoped role templates) ──────────────────────────────────
  findRolesByKeys(tenantId: string, keys: string[], db: Db = prisma): Promise<Role[]> {
    return db.role.findMany({ where: { tenantId, key: { in: keys } } });
  },

  // ── UserRole (role assignment on a membership) ─────────────────────────────
  /**
   * Replace all role assignments for a membership. Accepts an optional `db` —
   * pass a transaction client so the delete+create pair (and any surrounding
   * audit write) is atomic; not wrapped in its own `$transaction` here since
   * `db` may itself already be a `Prisma.TransactionClient`.
   */
  async replaceMembershipRoles(membershipId: string, roleIds: string[], db: Db = prisma): Promise<void> {
    await db.userRole.deleteMany({ where: { membershipId } });
    if (roleIds.length > 0) {
      await db.userRole.createMany({
        data: roleIds.map((roleId) => ({ membershipId, roleId })),
        skipDuplicates: true,
      });
    }
  },

  /** Run a function inside a transaction. */
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  },
};
