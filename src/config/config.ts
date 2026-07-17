import 'dotenv/config';

/**
 * Typed application configuration, loaded once from process.env.
 * Throws at startup if a required variable is missing so we fail fast
 * instead of surfacing `undefined` deep inside a request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function toInt(value: string, name: string): number {
  // Strip trailing inline comments that some .env files leave on the value line.
  const cleaned = value.split('#')[0]!.trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${value}"`);
  }
  return parsed;
}

const nodeEnv = optional('NODE_ENV', 'development');

export interface AppConfig {
  readonly env: string;
  readonly isProd: boolean;
  readonly isDev: boolean;
  readonly isTest: boolean;
  readonly port: number;
  readonly apiVersion: string;
  readonly databaseUrl: string;
  readonly redisUrl?: string;
  readonly jwt: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    /** seconds */
    readonly accessTtl: number;
    /** seconds */
    readonly refreshTtl: number;
  };
  readonly bcryptRounds: number;
  readonly corsOrigins: string[];
  readonly rateLimit: {
    readonly windowMs: number;
    readonly max: number;
    readonly authMax: number;
  };
  readonly storage: {
    readonly driver: string;
    readonly dir: string;
  };
  readonly cookie: {
    readonly refreshName: string;
    readonly secure: boolean;
    readonly sameSite: 'lax' | 'strict' | 'none';
  };
  /** Public frontend origin used in email links (password reset, etc.). */
  readonly appUrl: string;
  readonly mail: {
    readonly from: string;
    readonly smtpHost?: string;
    readonly smtpPort: number;
    readonly smtpSecure: boolean;
    readonly smtpUser?: string;
    readonly smtpPass?: string;
  };
}

const redisUrlRaw = process.env.REDIS_URL;

export const config: AppConfig = {
  env: nodeEnv,
  isProd: nodeEnv === 'production',
  isDev: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  port: toInt(optional('PORT', '3030'), 'PORT'),
  apiVersion: optional('API_VERSION', 'v1'),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: redisUrlRaw && redisUrlRaw.trim() !== '' ? redisUrlRaw.trim() : undefined,
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: toInt(optional('JWT_ACCESS_TTL', '900'), 'JWT_ACCESS_TTL'),
    /** Session / refresh lifetime — default 24 hours. */
    refreshTtl: toInt(optional('JWT_REFRESH_TTL', '86400'), 'JWT_REFRESH_TTL'),
  },
  bcryptRounds: toInt(optional('BCRYPT_ROUNDS', '12'), 'BCRYPT_ROUNDS'),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimit: {
    windowMs: toInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 'RATE_LIMIT_WINDOW_MS'),
    max: toInt(optional('RATE_LIMIT_MAX', '120'), 'RATE_LIMIT_MAX'),
    authMax: toInt(optional('AUTH_RATE_LIMIT_MAX', '10'), 'AUTH_RATE_LIMIT_MAX'),
  },
  storage: {
    driver: optional('STORAGE_DRIVER', 'local'),
    dir: optional('STORAGE_DIR', './storage'),
  },
  cookie: {
    refreshName: optional('REFRESH_COOKIE_NAME', 'finpay_rt'),
    secure: nodeEnv === 'production',
    sameSite: nodeEnv === 'production' ? 'strict' : 'lax',
  },
  appUrl: optional('APP_URL', 'http://localhost:5173'),
  mail: {
    from: optional('MAIL_FROM', 'Valoris Fusion <noreply@valorisfusion.com>'),
    smtpHost: process.env.SMTP_HOST?.trim() || undefined,
    smtpPort: toInt(optional('SMTP_PORT', '587'), 'SMTP_PORT'),
    smtpSecure: optional('SMTP_SECURE', 'false') === 'true',
    smtpUser: process.env.SMTP_USER?.trim() || undefined,
    smtpPass: process.env.SMTP_PASS?.trim() || undefined,
  },
};

export type Config = typeof config;
