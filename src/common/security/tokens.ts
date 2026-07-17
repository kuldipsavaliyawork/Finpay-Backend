import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from '../../config/config';
import { UnauthorizedError } from '../errors';

/** Claims embedded in the short-lived access token. */
export interface AccessTokenClaims {
  /** userId */
  sub: string;
  /** tenantId */
  tid: string;
  roles: string[];
  perms: string[];
}

/** Full decoded token including standard JWT registered claims. */
export type DecodedAccessToken = AccessTokenClaims & JwtPayload;

/** Sign a short-lived access JWT from the given claims. */
export function signAccess(claims: AccessTokenClaims): string {
  const options: SignOptions = { expiresIn: config.jwt.accessTtl, algorithm: 'HS256' };
  return jwt.sign(claims, config.jwt.accessSecret, options);
}

/** Claims for the short-lived MFA challenge token (pre-session). */
export interface MfaChallengeClaims {
  purpose: 'mfa';
  sub: string;
  tid: string;
  roles: string[];
  perms: string[];
  email: string;
  firstName: string;
  lastName: string;
}

export type DecodedMfaChallenge = MfaChallengeClaims & JwtPayload;

const MFA_TTL_SEC = 300;

/** Sign a 5-minute MFA challenge token after password verification. */
export function signMfaChallenge(claims: MfaChallengeClaims): string {
  const options: SignOptions = { expiresIn: MFA_TTL_SEC, algorithm: 'HS256' };
  return jwt.sign(claims, config.jwt.accessSecret, options);
}

/** Verify + decode an MFA challenge token. */
export function verifyMfaChallenge(token: string): DecodedMfaChallenge {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || (decoded as MfaChallengeClaims).purpose !== 'mfa') {
      throw new UnauthorizedError('Invalid MFA token');
    }
    return decoded as DecodedMfaChallenge;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired MFA token');
  }
}

/** Verify + decode an access token. Throws UnauthorizedError if invalid/expired. */
export function verifyAccess(token: string): DecodedAccessToken {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Invalid token');
    }
    return decoded as DecodedAccessToken;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** SHA-256 hex digest of an input string. */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Alias: hash a raw refresh token for storage/lookup. */
export function hashToken(raw: string): string {
  return sha256(raw);
}

export interface GeneratedRefresh {
  /** The opaque token to hand to the client (never stored raw). */
  raw: string;
  /** SHA-256 of raw; stored in RefreshToken.tokenHash. */
  hash: string;
}

/** Generate a cryptographically-random opaque refresh token and its hash. */
export function generateRefresh(): GeneratedRefresh {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw) };
}

/** Generate a random opaque token (used for password reset / email verification). */
export function generateOpaqueToken(bytes = 32): { raw: string; hash: string } {
  const raw = crypto.randomBytes(bytes).toString('hex');
  return { raw, hash: sha256(raw) };
}

/** Compute an absolute expiry Date `seconds` from now. */
export function expiryFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}
