import { Prisma, type PrismaClient, type Notification } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListNotificationArgs {
  skip: number;
  take: number;
  userId: string;
  unreadOnly?: boolean;
  type?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * A notification is visible to a user if it targets that user directly
 * (userId = the user) OR it is tenant-wide (userId is null).
 */
function notificationWhere(
  tenantId: string,
  userId: string,
  a: { unreadOnly?: boolean; type?: string },
): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {
    tenantId,
    OR: [{ userId }, { userId: null }],
  };
  if (a.unreadOnly) where.readAt = null;
  if (a.type) where.type = a.type;
  return where;
}

export const notificationsRepository = {
  findById(tenantId: string, id: string, db: Db = prisma): Promise<Notification | null> {
    return db.notification.findFirst({ where: { id, tenantId } });
  },

  list(tenantId: string, a: ListNotificationArgs, db: Db = prisma): Promise<Notification[]> {
    const where = notificationWhere(tenantId, a.userId, a);
    return db.notification.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { createdAt: a.sortDir ?? 'desc' },
    });
  },

  count(
    tenantId: string,
    a: { userId: string; unreadOnly?: boolean; type?: string },
    db: Db = prisma,
  ): Promise<number> {
    return db.notification.count({ where: notificationWhere(tenantId, a.userId, a) });
  },

  countUnread(tenantId: string, userId: string, db: Db = prisma): Promise<number> {
    return db.notification.count({
      where: { tenantId, OR: [{ userId }, { userId: null }], readAt: null },
    });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.NotificationUncheckedCreateInput, 'tenantId'>,
    db: Db = prisma,
  ): Promise<Notification> {
    return db.notification.create({ data: { ...data, tenantId } });
  },

  /** Mark a single notification (visible to this user) as read. Tenant + visibility scoped. */
  markRead(tenantId: string, id: string, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.notification.updateMany({
      where: { id, tenantId, OR: [{ userId }, { userId: null }], readAt: null },
      data: { readAt: new Date() },
    });
  },

  /** Mark every unread notification visible to this user as read. Returns count updated. */
  markAllRead(tenantId: string, userId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.notification.updateMany({
      where: { tenantId, OR: [{ userId }, { userId: null }], readAt: null },
      data: { readAt: new Date() },
    });
  },
};
