import { prisma, Prisma } from '../../infrastructure/prisma';
import type { Notification } from '@prisma/client';
import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import type { Ctx } from '../../common/http';
import { notificationsRepository as repo } from './notifications.repository';
import type { CreateNotificationInput, ListNotificationQuery } from './notifications.dto';
import type { Paging } from '../../common/pagination/pagination';

/**
 * Input for the internal notification-creation helper. `userId` omitted (or
 * null) means the notification is tenant-wide (visible to every user in the
 * tenant). Other modules (invoices, bills, approvals, ...) call
 * `notificationService.create(...)` directly — no HTTP round-trip needed.
 */
export interface CreateNotificationParams {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Actor that triggered this notification, for the audit trail (optional). */
  actorUserId?: string | null;
}

export const notificationsService = {
  async list(
    tenantId: string,
    userId: string,
    paging: Paging,
    filters: Pick<ListNotificationQuery, 'unreadOnly' | 'type' | 'sortDir'>,
  ) {
    const args = {
      skip: paging.skip,
      take: paging.take,
      userId,
      unreadOnly: filters.unreadOnly,
      type: filters.type,
      sortDir: filters.sortDir,
    };
    const [items, total] = await Promise.all([
      repo.list(tenantId, args),
      repo.count(tenantId, { userId, unreadOnly: filters.unreadOnly, type: filters.type }),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string): Promise<Notification> {
    const n = await repo.findById(tenantId, id);
    if (!n) throw new NotFoundError('Notification not found');
    return n;
  },

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    return repo.countUnread(tenantId, userId);
  },

  /**
   * Shared creation path — used both by the HTTP create endpoint and directly
   * by other modules (e.g. invoices, bills, approvals) as a NotificationService
   * helper. Writes the in-app Notification row and an OutboxEvent describing
   * an email-ready "notification.created" domain event, atomically.
   */
  async create(ctx: CreateNotificationParams, db?: Prisma.TransactionClient): Promise<Notification> {
    const run = async (tx: Prisma.TransactionClient) => {
      const notification = await repo.create(
        ctx.tenantId,
        {
          userId: ctx.userId ?? null,
          type: ctx.type,
          title: ctx.title,
          body: ctx.body ?? null,
          entityType: ctx.entityType ?? null,
          entityId: ctx.entityId ?? null,
        },
        tx,
      );

      await tx.outboxEvent.create({
        data: {
          tenantId: ctx.tenantId,
          type: 'notification.created',
          payload: {
            notificationId: notification.id,
            tenantId: ctx.tenantId,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            entityType: notification.entityType,
            entityId: notification.entityId,
          },
        },
      });

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.actorUserId ?? null,
          action: 'create',
          module: 'notifications',
          entityType: 'notification',
          entityId: notification.id,
          after: notification,
        },
        tx,
      );

      return notification;
    };

    if (db) return run(db);
    return prisma.$transaction((tx) => run(tx));
  },

  /** HTTP-facing wrapper for manual/admin notification creation. */
  async createFromRequest(ctx: Ctx, input: CreateNotificationInput): Promise<Notification> {
    return this.create({
      tenantId: ctx.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actorUserId: ctx.userId,
    });
  },

  async markRead(ctx: Ctx, id: string): Promise<Notification> {
    const before = await this.get(ctx.tenantId, id);
    await repo.markRead(ctx.tenantId, id, ctx.userId);
    const after = await this.get(ctx.tenantId, id);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'notifications',
      entityType: 'notification',
      entityId: id,
      before,
      after,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return after;
  },

  async markAllRead(ctx: Ctx): Promise<{ updated: number }> {
    const result = await repo.markAllRead(ctx.tenantId, ctx.userId);
    await AuditService.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'update',
      module: 'notifications',
      entityType: 'notification',
      entityId: null,
      after: { markAllRead: true, updated: result.count },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { updated: result.count };
  },
};

/**
 * NotificationService — the stable helper other modules import to raise
 * in-app notifications without depending on HTTP/controller concerns, e.g.:
 *
 *   import { NotificationService } from '../notifications/notifications.service';
 *   await NotificationService.notify({ tenantId, userId, type: 'invoice_overdue', title: '...' }, tx);
 */
export const NotificationService = {
  notify: (params: CreateNotificationParams, tx?: Prisma.TransactionClient) =>
    notificationsService.create(params, tx),
};
