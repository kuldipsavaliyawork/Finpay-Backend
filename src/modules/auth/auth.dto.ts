import { z } from 'zod';

/**
 * Zod request schemas for the auth module. Controllers read the validated,
 * typed output (see `validate` middleware) — never raw req.body.
 */

const email = z.string().trim().toLowerCase().email('A valid email is required');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(1).max(120);

export const registerSchema = z.object({
  // owner user
  email,
  password,
  firstName: name,
  lastName: name,
  // tenant / organization
  organizationName: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug may contain only lowercase letters, numbers and hyphens')
    .optional(),
  baseCurrency: z.string().trim().length(3).toUpperCase().optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  /** Optional: which tenant to log into when the user belongs to several. */
  tenantId: z.string().uuid().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  /** Optional; the middleware also accepts the refresh cookie. */
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

export const mfaVerifySchema = z.object({
  /** Accept both snake_case (frontend AuthContext) and camelCase. */
  mfa_token: z.string().min(1).optional(),
  mfaToken: z.string().min(1).optional(),
  code: z.string().min(6).max(32),
}).refine((v) => Boolean(v.mfa_token || v.mfaToken), {
  message: 'mfa_token is required',
  path: ['mfa_token'],
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;

export const mfaDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
