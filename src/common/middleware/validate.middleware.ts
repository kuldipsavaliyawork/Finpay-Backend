import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { ValidationError } from '../errors';

export type ValidationTarget = 'body' | 'query' | 'params';

function flatten(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.') || '_';
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

/**
 * validate — parse & replace req[target] with the schema's typed output.
 * On failure throws a ValidationError (422) with per-field details. After this
 * runs, controllers can safely read the validated shape from req[target].
 *
 * Note: for `query` and `params` we assign parsed values back onto the existing
 * object (Express getters are read-only in some versions) to stay type-safe.
 */
export function validate(schema: ZodTypeAny, target: ValidationTarget = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]) as unknown;
      if (target === 'body') {
        req.body = parsed;
      } else {
        // Mutate in place so we don't fight Express's query/params getters.
        const dest = req[target] as Record<string, unknown>;
        for (const key of Object.keys(dest)) delete dest[key];
        Object.assign(dest, parsed as Record<string, unknown>);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationError('Validation failed', flatten(err));
      }
      throw err;
    }
  };
}

/** Type helper: infer the validated type of a schema. */
export type Validated<S extends ZodTypeAny> = ZodInfer<S>;
