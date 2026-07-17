import type { Request, Response } from 'express';
import { ok, created, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { usersService } from './users.service';
import { toUserApi } from './users.mapper';
import type { InviteUserInput, UpdateMembershipInput, AssignRolesInput, ListUserQuery } from './users.dto';

export const usersController = {
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListUserQuery;
    const [items, total] = await usersService.list(tenantId, paging, {
      q: query.q,
      status: query.status,
      roleKey: query.roleKey,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toUserApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const membership = await usersService.get(tenantId, req.params.id as string);
    ok(res, toUserApi(membership));
  },

  async invite(req: Request, res: Response): Promise<void> {
    const membership = await usersService.invite(ctxOf(req), req.body as InviteUserInput);
    created(res, toUserApi(membership));
  },

  async updateProfile(req: Request, res: Response): Promise<void> {
    const membership = await usersService.updateProfile(
      ctxOf(req),
      req.params.id as string,
      req.body as UpdateMembershipInput,
    );
    ok(res, toUserApi(membership));
  },

  async enable(req: Request, res: Response): Promise<void> {
    const membership = await usersService.enable(ctxOf(req), req.params.id as string);
    ok(res, toUserApi(membership));
  },

  async disable(req: Request, res: Response): Promise<void> {
    const membership = await usersService.disable(ctxOf(req), req.params.id as string);
    ok(res, toUserApi(membership));
  },

  async assignRoles(req: Request, res: Response): Promise<void> {
    const { roleKeys } = req.body as AssignRolesInput;
    const membership = await usersService.assignRoles(ctxOf(req), req.params.id as string, roleKeys);
    ok(res, toUserApi(membership));
  },
};
