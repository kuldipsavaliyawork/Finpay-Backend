import pino, { type Logger, type LoggerOptions } from 'pino';
import { config } from '../../config/config';

/**
 * Application logger. Pretty-printed in development (when pino-pretty is
 * installed), structured JSON otherwise. Redacts common sensitive fields.
 */
const baseOptions: LoggerOptions = {
  level: config.isProd ? 'info' : config.isTest ? 'silent' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
};

/** Enable pino-pretty only in dev AND only if the module is actually installed. */
function prettyEnabled(): boolean {
  if (!config.isDev) return false;
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const options: LoggerOptions = prettyEnabled()
  ? {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    }
  : baseOptions;

export const logger: Logger = pino(options);

export type { Logger };
