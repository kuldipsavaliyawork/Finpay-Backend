import { UnprocessableError } from '../errors';

/** Soft parse — empty/invalid → `undefined`. */
export function parseOptionalDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/** Soft parse with fallback — empty/invalid → `fallback`. */
export function parseDateWithFallback(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Strict parse — empty/invalid throws `UnprocessableError`. */
export function requireDate(s: string, fallback?: Date): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    if (fallback) return fallback;
    throw new UnprocessableError(`Invalid date "${s}"`);
  }
  return d;
}
