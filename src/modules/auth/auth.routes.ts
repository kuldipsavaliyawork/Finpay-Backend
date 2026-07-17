import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { authLimiter } from '../../common/middleware/rateLimit.middleware';
import { authController } from './auth.controller';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  sessionIdParamSchema,
  mfaVerifySchema,
  mfaEnableSchema,
  mfaDisableSchema,
} from './auth.dto';

/**
 * Auth router. Public endpoints use the stricter authLimiter; account endpoints
 * require a valid access token (+ tenant context).
 */
export const authRouter: Router = Router();

// ── Public ──────────────────────────────────────────────────────────────────
authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register),
);

authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));

authRouter.post(
  '/refresh',
  authLimiter,
  validate(refreshSchema),
  asyncHandler(authController.refresh),
);

authRouter.post('/logout', validate(logoutSchema), asyncHandler(authController.logout));

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword),
);

authRouter.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(authController.verifyEmail),
);

authRouter.post(
  '/mfa/verify',
  authLimiter,
  validate(mfaVerifySchema),
  asyncHandler(authController.verifyMfa),
);

// ── Authenticated ─────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, requireTenant, asyncHandler(authController.me));

authRouter.get('/sessions', requireAuth, asyncHandler(authController.listSessions));

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  validate(sessionIdParamSchema, 'params'),
  asyncHandler(authController.revokeSession),
);

authRouter.get('/mfa', requireAuth, asyncHandler(authController.mfaStatus));
authRouter.post('/mfa/setup-totp', requireAuth, asyncHandler(authController.setupTotp));
authRouter.post(
  '/mfa/enable',
  requireAuth,
  validate(mfaEnableSchema),
  asyncHandler(authController.enableTotp),
);
authRouter.post(
  '/mfa/disable',
  requireAuth,
  validate(mfaDisableSchema),
  asyncHandler(authController.disableMfa),
);
