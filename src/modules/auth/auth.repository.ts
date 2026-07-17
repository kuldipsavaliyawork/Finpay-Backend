import { Prisma, type PrismaClient, type User, type RefreshToken } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Auth repository — all Prisma access for the auth module. Identity models
 * (User, RefreshToken, tokens) are global; tenant scoping is applied where the
 * model carries a tenantId (Membership, Role, etc.).
 */
export const authRepository = {
  // ── Users ────────────────────────────────────────────────────────────────
  findUserByEmail(email: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findUserById(id: string, db: Db = prisma): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  },

  createUser(data: Prisma.UserCreateInput, db: Db = prisma): Promise<User> {
    return db.user.create({ data });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput, db: Db = prisma): Promise<User> {
    return db.user.update({ where: { id }, data });
  },

  // ── Tenant / membership / roles ───────────────────────────────────────────
  findTenantBySlug(slug: string, db: Db = prisma) {
    return db.tenant.findUnique({ where: { slug } });
  },

  /**
   * All memberships for a user across tenants, including tenant + assigned
   * roles + each role's permissions. Used to build the access-token claims.
   */
  findMembershipsForUser(userId: string, db: Db = prisma) {
    return db.membership.findMany({
      where: { userId, status: 'active' },
      include: {
        tenant: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
  },

  findMembership(userId: string, tenantId: string, db: Db = prisma) {
    return db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        tenant: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
  },

  // ── Refresh tokens (rotation) ─────────────────────────────────────────────
  findRefreshByHash(tokenHash: string, db: Db = prisma): Promise<RefreshToken | null> {
    return db.refreshToken.findUnique({ where: { tokenHash } });
  },

  createRefreshToken(data: Prisma.RefreshTokenCreateInput, db: Db = prisma): Promise<RefreshToken> {
    return db.refreshToken.create({ data });
  },

  revokeRefreshToken(
    id: string,
    replacedById: string | null,
    db: Db = prisma,
  ): Promise<RefreshToken> {
    return db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    });
  },

  /** Revoke every non-revoked token in a rotation family (reuse detection). */
  revokeFamily(familyId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Active (non-revoked, non-expired) refresh tokens for a user — sessions. */
  listActiveRefreshTokens(userId: string, db: Db = prisma): Promise<RefreshToken[]> {
    return db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  },

  findRefreshById(id: string, db: Db = prisma): Promise<RefreshToken | null> {
    return db.refreshToken.findUnique({ where: { id } });
  },

  // ── Login attempts ────────────────────────────────────────────────────────
  recordLoginAttempt(data: Prisma.LoginAttemptCreateInput, db: Db = prisma) {
    return db.loginAttempt.create({ data });
  },

  // ── Password reset / email verification ───────────────────────────────────
  createPasswordReset(data: Prisma.PasswordResetTokenCreateInput, db: Db = prisma) {
    return db.passwordResetToken.create({ data });
  },

  findPasswordReset(tokenHash: string, db: Db = prisma) {
    return db.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  markPasswordResetUsed(id: string, db: Db = prisma) {
    return db.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  createEmailToken(data: Prisma.EmailVerificationTokenCreateInput, db: Db = prisma) {
    return db.emailVerificationToken.create({ data });
  },

  findEmailToken(tokenHash: string, db: Db = prisma) {
    return db.emailVerificationToken.findUnique({ where: { tokenHash } });
  },

  markEmailTokenUsed(id: string, db: Db = prisma) {
    return db.emailVerificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  // ── Tenant settings (password policy / lockout) ───────────────────────────
  findTenantSettings(tenantId: string, db: Db = prisma) {
    return db.tenantSettings.findUnique({ where: { tenantId } });
  },

  /** Run a function inside a transaction. */
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  },
};

export type MembershipWithRoles = Prisma.PromiseReturnType<
  typeof authRepository.findMembership
>;
