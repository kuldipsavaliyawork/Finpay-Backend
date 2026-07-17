import type { Request, Response } from 'express';
import { config } from '../../config/config';
import { ok, created, noContent } from '../../common/http/envelope';
import { UnauthorizedError } from '../../common/errors';
import { authService, type AuthContext, type AuthResult, type MfaChallengeResult } from './auth.service';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
  SessionIdParam,
  MfaVerifyInput,
  MfaEnableInput,
  MfaDisableInput,
} from './auth.dto';

function isMfaChallenge(result: AuthResult | MfaChallengeResult): result is MfaChallengeResult {
  return (result as MfaChallengeResult).mfaRequired === true;
}

/** Derive ip + user-agent from the request. */
function authContext(req: Request): AuthContext {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

/** Set the refresh token as an httpOnly cookie. */
function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(config.cookie.refreshName, refreshToken, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    maxAge: config.jwt.refreshTtl * 1000,
    path: '/',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.cookie.refreshName, { path: '/' });
}

/** Read the refresh token from body first, then cookie. */
function readRefreshToken(req: Request): string | undefined {
  const fromBody = (req.body as { refreshToken?: unknown })?.refreshToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[config.cookie.refreshName];
  return typeof fromCookie === 'string' && fromCookie.length > 0 ? fromCookie : undefined;
}

/** Shape the auth result for the response body (refresh token also in cookie). */
function authPayload(result: AuthResult) {
  return {
    user: result.user,
    tenant: result.tenant,
    roles: result.roles,
    perms: result.perms,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    expiresIn: result.tokens.expiresIn,
    refreshExpiresIn: result.tokens.refreshExpiresIn,
    sessionId: result.tokens.sessionId,
  };
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body as RegisterInput, authContext(req));
    setRefreshCookie(res, result.tokens.refreshToken);
    created(res, authPayload(result));
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body as LoginInput, authContext(req));
    if (isMfaChallenge(result)) {
      ok(res, result);
      return;
    }
    setRefreshCookie(res, result.tokens.refreshToken);
    ok(res, authPayload(result));
  },

  async verifyMfa(req: Request, res: Response): Promise<void> {
    const body = req.body as MfaVerifyInput;
    const token = body.mfa_token ?? body.mfaToken ?? '';
    const result = await authService.verifyMfaLogin(token, body.code, authContext(req));
    setRefreshCookie(res, result.tokens.refreshToken);
    ok(res, { ...authPayload(result), usedBackupCode: result.usedBackupCode });
  },

  async mfaStatus(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    ok(res, await authService.mfaStatus(ctx.userId));
  },

  async setupTotp(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    ok(res, await authService.setupTotp(ctx.userId));
  },

  async enableTotp(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const { code } = req.body as MfaEnableInput;
    ok(res, await authService.enableTotp(ctx.userId, code));
  },

  async disableMfa(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const { code } = req.body as MfaDisableInput;
    await authService.disableMfa(ctx.userId, code);
    ok(res, { message: 'Two-factor authentication disabled' });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token = readRefreshToken(req);
    if (!token) throw new UnauthorizedError('Missing refresh token');
    const result = await authService.refresh(token, authContext(req));
    setRefreshCookie(res, result.tokens.refreshToken);
    ok(res, authPayload(result));
  },

  async logout(req: Request, res: Response): Promise<void> {
    const token = readRefreshToken(req);
    await authService.logout(token, authContext(req));
    clearRefreshCookie(res);
    noContent(res);
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const resetToken = await authService.forgotPassword(
      req.body as ForgotPasswordInput,
      authContext(req),
    );
    // Do not reveal whether the email existed. In non-prod we echo the token
    // to ease local/E2E testing (see service note).
    ok(res, { message: 'If the email exists, a reset link has been sent', ...(resetToken ? { resetToken } : {}) });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.body as ResetPasswordInput, authContext(req));
    ok(res, { message: 'Password has been reset' });
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    await authService.verifyEmail(req.body as VerifyEmailInput);
    ok(res, { message: 'Email verified' });
  },

  async me(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const data = await authService.me(ctx.userId, ctx.tenantId);
    ok(res, data);
  },

  async listSessions(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const sessions = await authService.listSessions(ctx.userId);
    ok(res, sessions);
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    const ctx = req.ctx;
    if (!ctx) throw new UnauthorizedError('Authentication required');
    const { id } = req.params as unknown as SessionIdParam;
    await authService.revokeSession(ctx.userId, id);
    noContent(res);
  },
};
