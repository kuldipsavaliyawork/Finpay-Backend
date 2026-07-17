import bcrypt from 'bcryptjs';
import { config } from '../../config/config';

/** Hash a plaintext password with the configured bcrypt cost. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/** Constant-time compare of a plaintext password against a bcrypt hash. */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUpper: true,
  requireNumber: true,
  requireSymbol: false,
};

/**
 * Validate a password against a policy. Returns a list of human-readable
 * violation messages (empty = valid).
 */
export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a symbol');
  }
  return errors;
}
