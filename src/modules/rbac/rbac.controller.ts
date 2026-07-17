import type { Request, Response } from 'express';
import { ok, created, noContent, paginated, ctxOf } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { rbacService } from './rbac.service';
import {
  toRoleApi,
  toRoleWithPermissionsApi,
  toPermissionApi,
  toMembershipRoleApi,
} from './rbac.mapper';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  ListRoleQuery,
  ListPermissionQuery,
  SetRolePermissionsInput,
  AssignMembershipRoleInput,
} from './rbac.dto';

export const rbacController = {
  // ── Roles ────────────────────────────────────────────────────────────────
  async list(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const query = req.query as unknown as ListRoleQuery;
    const [items, total] = await rbacService.list(tenantId, paging, {
      q: query.q,
      isSystem: query.isSystem,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    paginated(res, items.map(toRoleApi), buildMeta(total, paging));
  },

  async get(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const role = await rbacService.getWithPermissions(tenantId, req.params.id as string);
    ok(res, toRoleWithPermissionsApi(role));
  },

  async create(req: Request, res: Response): Promise<void> {
    const role = await rbacService.create(ctxOf(req), req.body as CreateRoleInput);
    created(res, toRoleApi(role));
  },

  async update(req: Request, res: Response): Promise<void> {
    const role = await rbacService.update(ctxOf(req), req.params.id as string, req.body as UpdateRoleInput);
    ok(res, toRoleApi(role));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await rbacService.remove(ctxOf(req), req.params.id as string);
    noContent(res);
  },

  // ── Permission catalog ────────────────────────────────────────────────────
  async listPermissions(req: Request, res: Response): Promise<void> {
    const paging = parsePaging(req);
    const query = req.query as unknown as ListPermissionQuery;
    const [items, total] = await rbacService.listPermissions(paging, {
      q: query.q,
      resource: query.resource,
    });
    paginated(res, items.map(toPermissionApi), buildMeta(total, paging));
  },

  // ── Set permissions on a role ─────────────────────────────────────────────
  async setRolePermissions(req: Request, res: Response): Promise<void> {
    const { permissionKeys } = req.body as SetRolePermissionsInput;
    const role = await rbacService.setRolePermissions(ctxOf(req), req.params.id as string, permissionKeys);
    ok(res, toRoleWithPermissionsApi(role));
  },

  // ── Membership role assignment ────────────────────────────────────────────
  async listMembershipRoles(req: Request, res: Response): Promise<void> {
    const { tenantId } = req.ctx!;
    const roles = await rbacService.listMembershipRoles(tenantId, req.params.membershipId as string);
    ok(res, roles.map(toMembershipRoleApi));
  },

  async assignMembershipRole(req: Request, res: Response): Promise<void> {
    const { roleId } = req.body as AssignMembershipRoleInput;
    const result = await rbacService.assignRoleToMembership(ctxOf(req), req.params.membershipId as string, roleId);
    created(res, toMembershipRoleApi(result));
  },

  async removeMembershipRole(req: Request, res: Response): Promise<void> {
    await rbacService.removeRoleFromMembership(
      ctxOf(req),
      req.params.membershipId as string,
      req.params.roleId as string,
    );
    noContent(res);
  },
};
