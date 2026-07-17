import type { MembershipWithUserAndRoles } from './users.repository';

/** Membership (+ its global User + assigned roles) -> API DTO. */
export function toUserApi(m: MembershipWithUserAndRoles) {
  return {
    membershipId: m.id,
    userId: m.user.id,
    email: m.user.email,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    avatarUrl: m.user.avatarUrl,
    userStatus: m.user.status,
    membershipStatus: m.status,
    emailVerifiedAt: m.user.emailVerifiedAt ? m.user.emailVerifiedAt.toISOString() : null,
    lastLoginAt: m.user.lastLoginAt ? m.user.lastLoginAt.toISOString() : null,
    invitedBy: m.invitedBy,
    roles: m.roles.map((ur) => ({ id: ur.role.id, key: ur.role.key, name: ur.role.name })),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}
