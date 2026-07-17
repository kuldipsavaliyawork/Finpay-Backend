import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';
import { config } from '../../config/config';
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  type RoleKey,
} from '../../config/constants';
import {
  hashPassword,
  comparePassword,
  validatePasswordPolicy,
  type PasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
} from '../../common/security/password';
import {
  signAccess,
  signMfaChallenge,
  verifyMfaChallenge,
  generateRefresh,
  generateOpaqueToken,
  hashToken,
  sha256,
  expiryFromNow,
  type AccessTokenClaims,
} from '../../common/security/tokens';
import {
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  otpauthUrl,
} from '../../common/security/totp';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { logger } from '../../infrastructure/logger/logger';
import { EMAIL_QUEUE, queue } from '../../infrastructure/queue';
import { passwordResetEmail } from '../../infrastructure/mail/mailer';
import { authRepository as repo } from './auth.repository';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './auth.dto';

/** Request-derived metadata threaded into auth operations. */
export interface AuthContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** The token pair returned to the client on login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access-token lifetime in seconds. */
  expiresIn: number;
  refreshExpiresIn: number;
  /**
   * The refresh-token row id for THIS session. The client stores it so the
   * "Active Sessions" list can flag which entry is the current device (and
   * disable revoking it). Mirrors the ids returned by `listSessions()`.
   */
  sessionId: string;
}

export interface AuthResult {
  user: PublicUser;
  tenant: { id: string; name: string; slug: string };
  roles: string[];
  perms: string[];
  tokens: TokenPair;
}

/** Returned from login when the user has MFA enabled — no session yet. */
export interface MfaChallengeResult {
  mfaRequired: true;
  mfaToken: string;
  method: 'totp';
  destination?: string;
}

export type LoginOutcome = AuthResult | MfaChallengeResult;

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: string | null;
}

function toPublicUser(u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: Date | null;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    status: u.status,
    emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Expand the permission grant list for a set of role keys into concrete
 * permission keys, resolving the '*' wildcard.
 */
function permsForRoles(roleKeys: string[]): string[] {
  if (roleKeys.some((rk) => (ROLE_PERMISSIONS as Record<string, readonly string[]>)[rk]?.includes('*'))) {
    return ['*'];
  }
  const set = new Set<string>();
  for (const rk of roleKeys) {
    for (const p of (ROLE_PERMISSIONS as Record<string, readonly string[]>)[rk] ?? []) set.add(p);
  }
  return [...set];
}

export const authService = {
  /**
   * Register a new tenant with an owner user. Creates: Tenant, TenantSettings,
   * the 5 default roles (with permission grants), the owner User, a Membership,
   * and the owner UserRole — all in one transaction. Returns tokens so the
   * client is logged in immediately.
   */
  async register(input: RegisterInput, ctx: AuthContext): Promise<AuthResult> {
    const existing = await repo.findUserByEmail(input.email);
    if (existing) throw new ConflictError('An account with this email already exists');

    const policyErrors = validatePasswordPolicy(input.password);
    if (policyErrors.length > 0) {
      throw new ValidationError('Password does not meet policy', { password: policyErrors });
    }

    const slug = input.slug ?? (slugify(input.organizationName) || `org-${Date.now()}`);
    const slugTaken = await repo.findTenantBySlug(slug);
    if (slugTaken) throw new ConflictError('Organization slug is already taken', { slug });

    const passwordHash = await hashPassword(input.password);

    const result = await repo.transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.organizationName,
          slug,
          baseCurrency: input.baseCurrency ?? 'INR',
          country: input.country ?? 'IN',
        },
      });

      await tx.tenantSettings.create({ data: { tenantId: tenant.id } });

      // Ensure global Permission rows exist (idempotent), then map by key.
      await tx.permission.createMany({
        data: PERMISSIONS.map((p) => ({
          key: p.key,
          resource: p.resource,
          action: p.action,
          description: p.description,
        })),
        skipDuplicates: true,
      });
      const allPerms = await tx.permission.findMany();
      const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

      // Create the 5 default roles for this tenant with their grants.
      const roleIdByKey = new Map<RoleKey, string>();
      for (const def of DEFAULT_ROLES) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            key: def.key,
            name: def.name,
            description: def.description,
            isSystem: true,
          },
        });
        roleIdByKey.set(def.key, role.id);

        const grants = ROLE_PERMISSIONS[def.key];
        const permIds = grants.includes('*')
          ? allPerms.map((p) => p.id)
          : grants.map((k) => permByKey.get(k)).filter((id): id is string => Boolean(id));
        if (permIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permIds.map((permissionId) => ({ roleId: role.id, permissionId })),
            skipDuplicates: true,
          });
        }
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          tenantId: tenant.id,
        },
      });

      const membership = await tx.membership.create({
        data: { tenantId: tenant.id, userId: user.id, status: 'active' },
      });

      const ownerRoleId = roleIdByKey.get(ROLE_KEYS.OWNER)!;
      await tx.userRole.create({ data: { membershipId: membership.id, roleId: ownerRoleId } });

      await AuditService.record(
        {
          tenantId: tenant.id,
          userId: user.id,
          action: 'register',
          module: 'auth',
          entityType: 'tenant',
          entityId: tenant.id,
          after: { tenant: tenant.slug, ownerEmail: user.email },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return { tenant, user };
    });

    const roles = [ROLE_KEYS.OWNER as string];
    const perms = permsForRoles(roles);
    const tokens = await this.issueTokens(
      { userId: result.user.id, tenantId: result.tenant.id, roles, perms },
      ctx,
    );

    return {
      user: toPublicUser(result.user),
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      roles,
      perms,
      tokens,
    };
  },

  /**
   * Authenticate a user. Enforces account lockout, records every LoginAttempt,
   * and issues tokens for the resolved tenant. If the user belongs to multiple
   * tenants and none is specified, the home tenant (or first membership) is used.
   */
  async login(input: LoginInput, ctx: AuthContext): Promise<LoginOutcome> {
    const user = await repo.findUserByEmail(input.email);

    // Uniform failure to avoid user enumeration, but still record the attempt.
    if (!user) {
      await repo.recordLoginAttempt({
        email: input.email,
        success: false,
        reason: 'bad_password',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await repo.recordLoginAttempt({
        user: { connect: { id: user.id } },
        email: input.email,
        success: false,
        reason: 'locked',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new ForbiddenError('Account is temporarily locked. Try again later.');
    }

    if (user.status === 'disabled') {
      throw new ForbiddenError('Account is disabled');
    }

    const passwordOk = await comparePassword(input.password, user.passwordHash);
    if (!passwordOk) {
      await this.registerFailedLogin(user.id, input.email, ctx);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Resolve tenant + roles/perms from memberships.
    const memberships = await repo.findMembershipsForUser(user.id);
    if (memberships.length === 0) {
      throw new ForbiddenError('User has no active organization membership');
    }
    const membership =
      (input.tenantId && memberships.find((m) => m.tenantId === input.tenantId)) ||
      memberships.find((m) => m.tenantId === user.tenantId) ||
      memberships[0]!;
    if (input.tenantId && membership.tenantId !== input.tenantId) {
      throw new ForbiddenError('No membership for the requested organization');
    }

    const { roles, perms } = this.resolveRolesAndPerms(membership);

    // MFA challenge — password OK but do not issue session tokens yet.
    if (user.mfaEnabled) {
      const mfaToken = signMfaChallenge({
        purpose: 'mfa',
        sub: user.id,
        tid: membership.tenantId,
        roles,
        perms,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      await repo.recordLoginAttempt({
        user: { connect: { id: user.id } },
        email: input.email,
        success: true,
        reason: 'mfa_required',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        mfaRequired: true,
        mfaToken,
        method: 'totp',
        destination: maskEmail(user.email),
      };
    }

    // Reset lockout counters + record success.
    await repo.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
    await repo.recordLoginAttempt({
      user: { connect: { id: user.id } },
      email: input.email,
      success: true,
      reason: 'ok',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const tokens = await this.issueTokens(
      { userId: user.id, tenantId: membership.tenantId, roles, perms },
      ctx,
    );

    await AuditService.record({
      tenantId: membership.tenantId,
      userId: user.id,
      action: 'login',
      module: 'auth',
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      user: toPublicUser(user),
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      roles,
      perms,
      tokens,
    };
  },

  /**
   * Rotate a refresh token. Verifies the presented token's hash exists, is not
   * expired, and is not revoked. Reuse of a REVOKED token triggers family-wide
   * revocation (theft detection) and a 401. On success issues a new access +
   * refresh pair, and links old→new via replacedById.
   */
  async refresh(rawToken: string, ctx: AuthContext): Promise<AuthResult> {
    const tokenHash = hashToken(rawToken);
    const record = await repo.findRefreshByHash(tokenHash);
    if (!record) throw new UnauthorizedError('Invalid refresh token');

    if (record.revokedAt) {
      // Presented an already-revoked token → possible theft. Burn the family.
      await repo.revokeFamily(record.familyId);
      logger.warn({ familyId: record.familyId, userId: record.userId }, 'Refresh token reuse detected');
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    const user = await repo.findUserById(record.userId);
    if (!user || user.status === 'disabled') {
      throw new UnauthorizedError('User is not active');
    }

    const tenantId = record.tenantId ?? user.tenantId;
    if (!tenantId) throw new UnauthorizedError('No tenant bound to refresh token');

    const membership = await repo.findMembership(user.id, tenantId);
    if (!membership) throw new ForbiddenError('Membership no longer active');
    const { roles, perms } = this.resolveRolesAndPerms(membership);

    // Rotate within a transaction: mint child, revoke parent → child.
    const newRefresh = generateRefresh();
    const refreshExpiresAt = expiryFromNow(config.jwt.refreshTtl);

    let newSessionId = '';
    await repo.transaction(async (tx) => {
      const created = await repo.createRefreshToken(
        {
          user: { connect: { id: user.id } },
          tenantId,
          tokenHash: newRefresh.hash,
          familyId: record.familyId,
          expiresAt: refreshExpiresAt,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      newSessionId = created.id;
      await repo.revokeRefreshToken(record.id, created.id, tx);
    });

    const claims: AccessTokenClaims = { sub: user.id, tid: tenantId, roles, perms };
    const accessToken = signAccess(claims);

    return {
      user: toPublicUser(user),
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      roles,
      perms,
      tokens: {
        accessToken,
        refreshToken: newRefresh.raw,
        expiresIn: config.jwt.accessTtl,
        refreshExpiresIn: config.jwt.refreshTtl,
        sessionId: newSessionId,
      },
    };
  },

  /** Revoke a single refresh token (logout of the current session). */
  async logout(rawToken: string | undefined, ctx: AuthContext): Promise<void> {
    if (!rawToken) return; // nothing to revoke; treat as success (idempotent)
    const record = await repo.findRefreshByHash(hashToken(rawToken));
    if (record && !record.revokedAt) {
      await repo.revokeRefreshToken(record.id, null);
      await AuditService.record({
        tenantId: record.tenantId,
        userId: record.userId,
        action: 'logout',
        module: 'auth',
        entityType: 'refresh_token',
        entityId: record.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      // Notify other devices so Profile Active Sessions + toasts stay in sync.
      try {
        const { sessionRegistry } = await import('../../realtime/session-registry');
        sessionRegistry.remove(record.id);
        sessionRegistry.emitRevoked(record.userId, record.id);
        sessionRegistry.pushSessions(record.userId);
        if (record.tenantId) sessionRegistry.pushOnline(record.tenantId);
      } catch {
        /* realtime optional in some test contexts */
      }
    }
  },

  /**
   * Begin a password reset. Always returns void (no user enumeration). When the
   * email matches a user, a reset token is created; the raw token is returned to
   * the caller only in non-production so it can be surfaced/tested (in prod an
   * email would carry it). Returns the raw token or null.
   */
  async forgotPassword(input: ForgotPasswordInput, ctx: AuthContext): Promise<string | null> {
    const user = await repo.findUserByEmail(input.email);
    if (!user) return null;

    const { raw, hash } = generateOpaqueToken();
    await repo.createPasswordReset({
      user: { connect: { id: user.id } },
      tokenHash: hash,
      expiresAt: expiryFromNow(3600), // 1 hour
    });

    await AuditService.record({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'forgot_password',
      module: 'auth',
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    // Enqueue transactional email (SMTP when configured; otherwise logged).
    await queue.enqueue(EMAIL_QUEUE, passwordResetEmail(user.email, raw), {
      attempts: 3,
      jobId: `pwd-reset-${user.id}-${Date.now()}`,
    });

    // Non-prod: also echo the raw token so local/E2E can complete without SMTP.
    return config.isProd ? null : raw;
  },

  /** Complete a password reset using a valid, unused, unexpired token. */
  async resetPassword(input: ResetPasswordInput, ctx: AuthContext): Promise<void> {
    const record = await repo.findPasswordReset(hashToken(input.token));
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const policyErrors = validatePasswordPolicy(input.password);
    if (policyErrors.length > 0) {
      throw new ValidationError('Password does not meet policy', { password: policyErrors });
    }

    const passwordHash = await hashPassword(input.password);
    await repo.transaction(async (tx) => {
      await repo.updateUser(record.userId, { passwordHash, failedLoginCount: 0, lockedUntil: null }, tx);
      await repo.markPasswordResetUsed(record.id, tx);
      // Invalidate all refresh tokens for this user is handled globally below.
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await AuditService.record({
      userId: record.userId,
      action: 'reset_password',
      module: 'auth',
      entityType: 'user',
      entityId: record.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /** Verify an email using a token. */
  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    const record = await repo.findEmailToken(hashToken(input.token));
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestError('Invalid or expired verification token');
    }
    await repo.transaction(async (tx) => {
      await repo.updateUser(record.userId, { emailVerifiedAt: new Date() }, tx);
      await repo.markEmailTokenUsed(record.id, tx);
    });
  },

  /** Current user profile + tenant + roles + perms (for GET /me). */
  async me(userId: string, tenantId: string): Promise<AuthResult['user'] & {
    tenant: AuthResult['tenant'];
    roles: string[];
    perms: string[];
  }> {
    const user = await repo.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const membership = await repo.findMembership(userId, tenantId);
    if (!membership) throw new ForbiddenError('No active membership');
    const { roles, perms } = this.resolveRolesAndPerms(membership);
    return {
      ...toPublicUser(user),
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      roles,
      perms,
    };
  },

  /** List active sessions (non-revoked refresh tokens) for a user. */
  async listSessions(userId: string) {
    const tokens = await repo.listActiveRefreshTokens(userId);
    return tokens.map((t) => ({
      id: t.id,
      ip: t.ip,
      userAgent: t.userAgent,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
    }));
  },

  /** Revoke a specific session by refresh-token id (must belong to the user). */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const token = await repo.findRefreshById(sessionId);
    if (!token || token.userId !== userId) {
      throw new NotFoundError('Session not found');
    }
    if (!token.revokedAt) {
      await repo.revokeRefreshToken(token.id, null);
      try {
        const { sessionRegistry } = await import('../../realtime/session-registry');
        sessionRegistry.remove(sessionId);
        sessionRegistry.emitRevoked(userId, sessionId);
        if (token.tenantId) sessionRegistry.pushOnline(token.tenantId);
        sessionRegistry.pushSessions(userId);
      } catch {
        /* realtime optional at boot */
      }
    }
  },

  /**
   * Complete MFA challenge after password login. Accepts a 6-digit TOTP or a
   * backup code. Issues the session on success.
   */
  async verifyMfaLogin(
    mfaToken: string,
    code: string,
    ctx: AuthContext,
  ): Promise<AuthResult & { usedBackupCode: boolean }> {
    const challenge = verifyMfaChallenge(mfaToken);
    const user = await repo.findUserById(challenge.sub);
    if (!user || !user.mfaEnabled) throw new UnauthorizedError('MFA is not enabled');

    const mfa = await prisma.mfaConfig.findUnique({ where: { userId: user.id } });
    if (!mfa?.verified || !mfa.secret) throw new UnauthorizedError('MFA is not configured');

    const clean = code.trim().toUpperCase();
    let usedBackupCode = false;

    if (/^\d{6}$/.test(clean)) {
      if (!verifyTotp(mfa.secret, clean)) {
        throw new UnauthorizedError('Invalid authentication code');
      }
    } else {
      // Backup code — compare against hashed store, consume on match.
      const hashed = sha256(clean);
      const idx = mfa.backupCodes.findIndex((h) => h === hashed);
      if (idx < 0) throw new UnauthorizedError('Invalid authentication code');
      const next = [...mfa.backupCodes];
      next.splice(idx, 1);
      await prisma.mfaConfig.update({
        where: { userId: user.id },
        data: { backupCodes: next },
      });
      usedBackupCode = true;
    }

    await repo.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    const tokens = await this.issueTokens(
      {
        userId: user.id,
        tenantId: challenge.tid,
        roles: challenge.roles,
        perms: challenge.perms,
      },
      ctx,
    );

    const memberships = await repo.findMembershipsForUser(user.id);
    const membership = memberships.find((m) => m.tenantId === challenge.tid) ?? memberships[0]!;

    await AuditService.record({
      tenantId: challenge.tid,
      userId: user.id,
      action: 'login_mfa',
      module: 'auth',
      entityType: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      user: toPublicUser(user),
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      roles: challenge.roles,
      perms: challenge.perms,
      tokens,
      usedBackupCode,
    };
  },

  /** Authenticated: begin TOTP enrollment (returns secret + QR). */
  async setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const user = await repo.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const secret = generateTotpSecret();
    await prisma.mfaConfig.upsert({
      where: { userId },
      create: { userId, secret, verified: false, backupCodes: [] },
      update: { secret, verified: false, backupCodes: [] },
    });
    await repo.updateUser(userId, { mfaEnabled: false });

    const url = otpauthUrl(user.email, secret);
    const QRCode = (await import('qrcode')).default;
    const qrCodeDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    return { secret, otpauthUrl: url, qrCodeDataUrl };
  },

  /** Authenticated: confirm TOTP and enable MFA; returns one-time backup codes. */
  async enableTotp(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const mfa = await prisma.mfaConfig.findUnique({ where: { userId } });
    if (!mfa?.secret) throw new BadRequestError('Start MFA setup first');
    if (!verifyTotp(mfa.secret, code)) throw new BadRequestError('Invalid authenticator code');

    const plaintext = generateBackupCodes();
    const hashed = plaintext.map((c) => sha256(c));
    await prisma.mfaConfig.update({
      where: { userId },
      data: { verified: true, backupCodes: hashed },
    });
    await repo.updateUser(userId, { mfaEnabled: true });
    return { backupCodes: plaintext };
  },

  async mfaStatus(userId: string): Promise<{ enabled: boolean; verified: boolean; backupCodesLeft: number }> {
    const user = await repo.findUserById(userId);
    const mfa = await prisma.mfaConfig.findUnique({ where: { userId } });
    return {
      enabled: Boolean(user?.mfaEnabled),
      verified: Boolean(mfa?.verified),
      backupCodesLeft: mfa?.backupCodes?.length ?? 0,
    };
  },

  async disableMfa(userId: string, code: string): Promise<void> {
    const user = await repo.findUserById(userId);
    if (!user?.mfaEnabled) throw new BadRequestError('MFA is not enabled');
    const mfa = await prisma.mfaConfig.findUnique({ where: { userId } });
    if (!mfa?.secret || !verifyTotp(mfa.secret, code)) {
      throw new UnauthorizedError('Invalid authenticator code');
    }
    await prisma.mfaConfig.update({
      where: { userId },
      data: { verified: false, secret: 'disabled', backupCodes: [] },
    });
    await repo.updateUser(userId, { mfaEnabled: false });
  },

  // ── internal helpers ───────────────────────────────────────────────────────

  /** Increment failed-login counter and lock the account past the threshold. */
  async registerFailedLogin(userId: string, email: string, ctx: AuthContext): Promise<void> {
    const user = await repo.findUserById(userId);
    if (!user) return;
    const settings = user.tenantId ? await repo.findTenantSettings(user.tenantId) : null;
    const threshold = settings?.lockoutThreshold ?? 5;
    const lockMinutes = settings?.lockoutMinutes ?? 15;

    const nextCount = user.failedLoginCount + 1;
    const shouldLock = nextCount >= threshold;
    await repo.updateUser(userId, {
      failedLoginCount: nextCount,
      lockedUntil: shouldLock ? expiryFromNow(lockMinutes * 60) : user.lockedUntil,
      status: shouldLock ? 'locked' : user.status,
    });
    await repo.recordLoginAttempt({
      user: { connect: { id: userId } },
      email,
      success: false,
      reason: shouldLock ? 'locked' : 'bad_password',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  },

  /** Extract role keys + permission keys from a membership-with-roles include. */
  resolveRolesAndPerms(membership: {
    roles: {
      role: { key: string; permissions: { permission: { key: string } }[] };
    }[];
  }): { roles: string[]; perms: string[] } {
    const roleKeys = membership.roles.map((ur) => ur.role.key);
    // If any role is a full-access role, short-circuit to wildcard.
    if (
      roleKeys.some((rk) =>
        (ROLE_PERMISSIONS as Record<string, readonly string[]>)[rk]?.includes('*'),
      )
    ) {
      return { roles: roleKeys, perms: ['*'] };
    }
    const permSet = new Set<string>();
    for (const ur of membership.roles) {
      for (const rp of ur.role.permissions) permSet.add(rp.permission.key);
    }
    return { roles: roleKeys, perms: [...permSet] };
  },

  /** Sign an access token + create a persisted refresh token (new family). */
  async issueTokens(
    args: { userId: string; tenantId: string; roles: string[]; perms: string[] },
    ctx: AuthContext,
    familyId?: string,
  ): Promise<TokenPair> {
    const claims: AccessTokenClaims = {
      sub: args.userId,
      tid: args.tenantId,
      roles: args.roles,
      perms: args.perms,
    };
    const accessToken = signAccess(claims);

    const refresh = generateRefresh();
    const expiresAt = expiryFromNow(config.jwt.refreshTtl);
    // Each fresh login/register starts a new rotation family (random UUID).
    // Refresh rotation reuses the parent's familyId (see refresh()).
    const family = familyId ?? crypto.randomUUID();
    const created = await repo.createRefreshToken({
      user: { connect: { id: args.userId } },
      tenantId: args.tenantId,
      tokenHash: refresh.hash,
      familyId: family,
      expiresAt,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken,
      refreshToken: refresh.raw,
      expiresIn: config.jwt.accessTtl,
      refreshExpiresIn: config.jwt.refreshTtl,
      sessionId: created.id,
    };
  },
};

// Ensure Prisma import is referenced (used for typing in helpers/transactions).
export type { Prisma };
