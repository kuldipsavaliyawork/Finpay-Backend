import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  generateBackupCodes,
} from '../../src/common/security/totp';

describe('totp', () => {
  it('generates a base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('verifies a freshly generated code', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  it('generates backup codes', () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
  });
});
