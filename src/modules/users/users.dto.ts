import { z } from 'zod';

/**
 * Zod request schemas for the users module. Controllers read the validated,
 * typed output (see `validate` middleware) — never raw req.body/query/params.
 *
 * "Users" here means tenant Memberships (a User is a global identity; a
 * Membership binds it to this tenant with a status + roles). Listing/reading
 * is by membership id so every operation is naturally tenant-scoped.
 */

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  /** Role keys (e.g. "accountant", "viewer") to assign on the new membership. */
  roleKeys: z.array(z.string().trim().min(1)).min(1),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateMembershipSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const assignRolesSchema = z.object({
  roleKeys: z.array(z.string().trim().min(1)).min(1),
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export const listUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  status: z.enum(['active', 'invited', 'disabled']).optional(),
  roleKey: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'email', 'firstName', 'lastName']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type ListUserQuery = z.infer<typeof listUserQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;
