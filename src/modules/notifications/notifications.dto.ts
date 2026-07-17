import { z } from 'zod';

/**
 * Zod request schemas for the notifications module. Controllers read the
 * validated, typed output (see `validate` middleware) — never raw
 * req.body/query/params.
 */

export const listNotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  type: z.string().trim().max(100).optional(),
  sortBy: z.enum(['createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListNotificationQuery = z.infer<typeof listNotificationQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

/**
 * Body schema for the internal "create notification" endpoint. In practice
 * other modules call `notificationService.create(...)` directly (see
 * notifications.service.ts), but this schema backs the HTTP route used for
 * manual/admin/service-to-service creation (e.g. broadcast announcements).
 */
export const createNotificationSchema = z.object({
  userId: z.string().uuid().optional(), // omit for a tenant-wide notification
  type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().uuid().optional(),
});
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
