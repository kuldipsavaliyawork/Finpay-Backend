import type { Notification } from '@prisma/client';

/** Notification entity -> API DTO. No Decimal fields on this entity. */
export function toNotificationApi(n: Notification) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    isRead: n.readAt !== null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
