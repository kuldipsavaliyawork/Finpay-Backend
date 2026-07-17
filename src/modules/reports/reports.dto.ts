import { z } from 'zod';

/** Reports accept an optional `asOf` ISO date to compute balances up to a point. */
export const reportQuerySchema = z.object({
  asOf: z.string().trim().optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
