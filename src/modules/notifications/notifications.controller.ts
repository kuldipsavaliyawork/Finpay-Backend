import type { Request, Response } from 'express';
import { ok, created, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { notificationsService } from './notifications.service';
import { toNotificationApi } from './notifications.mapper';
import type { CreateNotificationInput, ListNotificationQuery } from './notifications.dto';

export const notificationsController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId, userId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListNotificationQuery;
    const [items, total] = await notificationsService.list(tenantId, userId, paging, {
      unreadOnly: query.unreadOnly,
      type: query.type,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toNotificationApi), buildMeta(total, paging));
  },

  async unreadCount(req: Request, res: Response): Promise<void> {
    const { tenantId, userId } = req.ctx!;
    const count = await notificationsService.unreadCount(tenantId, userId);
    ok(res, { count });
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const notification = await notificationsService.get(tenantId, req.params.id as string);
    ok(res, toNotificationApi(notification));
  },

  async create(req: Request, res: Response): Promise<void> {
    const notification = await notificationsService.createFromRequest(
      ctxOf(req),
      req.body as CreateNotificationInput,
    );
    created(res, toNotificationApi(notification));
  },

  async markRead(req: Request, res: Response): Promise<void> {
    const notification = await notificationsService.markRead(ctxOf(req), req.params.id as string);
    ok(res, toNotificationApi(notification));
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const result = await notificationsService.markAllRead(ctxOf(req));
    ok(res, result);
  },
};
