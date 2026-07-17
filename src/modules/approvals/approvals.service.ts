import { prisma, type Prisma } from '../../infrastructure/prisma';
import { NotFoundError, ConflictError, ForbiddenError, UnprocessableError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import type { Ctx } from '../../common/http';
import { approvalsRepository as repo } from './approvals.repository';
import type { CreateApprovalRequestInput } from './approvals.dto';
import type { Paging } from '../../common/pagination/pagination';

type EntityType = 'invoice' | 'bill' | 'expense' | 'journal';

/** Maps an approval entityType to its Prisma model delegate name and FK column on ApprovalRequest. */
const ENTITY_CONFIG: Record<
  EntityType,
  { fkField: 'invoiceId' | 'billId' | 'expenseId' | 'journalId'; model: 'invoice' | 'bill' | 'expense' | 'journalEntry' }
> = {
  invoice: { fkField: 'invoiceId', model: 'invoice' },
  bill: { fkField: 'billId', model: 'bill' },
  expense: { fkField: 'expenseId', model: 'expense' },
  journal: { fkField: 'journalId', model: 'journalEntry' },
};

async function findEntity(tenantId: string, entityType: EntityType, entityId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const cfg = ENTITY_CONFIG[entityType];
  switch (cfg.model) {
    case 'invoice':
      return db.invoice.findFirst({ where: { id: entityId, tenantId, deletedAt: null } });
    case 'bill':
      return db.bill.findFirst({ where: { id: entityId, tenantId, deletedAt: null } });
    case 'expense':
      return db.expense.findFirst({ where: { id: entityId, tenantId, deletedAt: null } });
    case 'journalEntry':
      return db.journalEntry.findFirst({ where: { id: entityId, tenantId } });
  }
}

async function flipEntityStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  entityType: EntityType,
  entityId: string,
  status: string,
): Promise<void> {
  const cfg = ENTITY_CONFIG[entityType];
  switch (cfg.model) {
    case 'invoice':
      await tx.invoice.updateMany({ where: { id: entityId, tenantId, deletedAt: null }, data: { status } });
      return;
    case 'bill':
      await tx.bill.updateMany({ where: { id: entityId, tenantId, deletedAt: null }, data: { status } });
      return;
    case 'expense':
      await tx.expense.updateMany({ where: { id: entityId, tenantId, deletedAt: null }, data: { status } });
      return;
    case 'journalEntry':
      await tx.journalEntry.updateMany({ where: { id: entityId, tenantId }, data: { status } });
      return;
  }
}

export const approvalsService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: {
      status?: string;
      entityType?: string;
      requestedBy?: string;
      sortBy?: 'createdAt' | 'updatedAt' | 'currentLevel';
      sortDir?: 'asc' | 'desc';
    },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const request = await repo.findById(tenantId, id);
    if (!request) throw new NotFoundError('Approval request not found');
    return request;
  },

  /** List approval requests where the caller is the approver on the current pending level. */
  async listPendingForApprover(
    tenantId: string,
    approverId: string,
    paging: Paging,
    filters: { entityType?: string },
  ) {
    const [items, total] = await Promise.all([
      repo.findPendingStepsForApprover(tenantId, approverId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.countPendingStepsForApprover(tenantId, approverId, filters),
    ]);
    return [items, total] as const;
  },

  /**
   * Create a multi-level approval request for an entity (invoice/bill/expense/journal).
   * `approverIds[0]` is level 1, `approverIds[1]` is level 2, etc. The entity must exist,
   * not already deleted, and must not already have an open (pending) approval request.
   */
  async create(ctx: Ctx, input: CreateApprovalRequestInput) {
    const entityType = input.entityType as EntityType;
    const cfg = ENTITY_CONFIG[entityType];

    const entity = await findEntity(ctx.tenantId, entityType, input.entityId);
    if (!entity) throw new NotFoundError(`${entityType} not found`);

    const existing = await repo.findByEntity(ctx.tenantId, entityType, input.entityId);
    if (existing && existing.status === 'pending') {
      throw new ConflictError('This entity already has a pending approval request', { requestId: existing.id });
    }

    const totalLevels = input.approverIds.length;

    const created = await prisma.$transaction(async (tx) => {
      const request = await repo.create(
        {
          tenantId: ctx.tenantId,
          entityType,
          status: 'pending',
          currentLevel: 1,
          totalLevels,
          requestedBy: ctx.userId,
          [cfg.fkField]: input.entityId,
          steps: input.approverIds.map((approverId, idx) => ({
            tenantId: ctx.tenantId,
            level: idx + 1,
            approverId,
            status: 'pending' as const,
          })),
        } as unknown as Prisma.ApprovalRequestUncheckedCreateInput & {
          steps: Prisma.ApprovalStepCreateManyRequestInput[];
        },
        tx,
      );

      // Mark the source entity as pending approval, if it has a 'pending' concept.
      if (entityType !== 'journal') {
        await flipEntityStatus(tx, ctx.tenantId, entityType, input.entityId, 'pending');
      }

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'create',
          module: 'approvals',
          entityType: 'approval_request',
          entityId: request.id,
          after: { entityType, entityId: input.entityId, totalLevels },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );

      return request;
    });

    return this.get(ctx.tenantId, created.id);
  },

  /**
   * Approve the current-level step (must belong to the requesting user). Advances
   * currentLevel; if it was the final level, flips the request AND the underlying
   * entity to 'approved'.
   */
  async approveStep(ctx: Ctx, requestId: string, stepId: string, comment?: string) {
    const request = await this.get(ctx.tenantId, requestId);
    if (request.status !== 'pending') {
      throw new UnprocessableError('Approval request is not pending', { status: request.status });
    }

    const step = request.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundError('Approval step not found');
    if (step.level !== request.currentLevel) {
      throw new ConflictError('This step is not the current level awaiting action', {
        stepLevel: step.level,
        currentLevel: request.currentLevel,
      });
    }
    if (step.status !== 'pending') {
      throw new UnprocessableError('This step has already been acted on', { status: step.status });
    }
    if (step.approverId && step.approverId !== ctx.userId) {
      throw new ForbiddenError('You are not the assigned approver for this step');
    }

    const entityType = request.entityType as EntityType;
    const entityId = (request.invoiceId ?? request.billId ?? request.expenseId ?? request.journalId) as string;
    const isFinalLevel = request.currentLevel >= request.totalLevels;

    await prisma.$transaction(async (tx) => {
      await repo.updateStep(
        ctx.tenantId,
        step.id,
        { status: 'approved', comment: comment ?? null, actedAt: new Date() },
        tx,
      );

      if (isFinalLevel) {
        await repo.updateStatus(ctx.tenantId, request.id, { status: 'approved' }, tx);
        await flipEntityStatus(tx, ctx.tenantId, entityType, entityId, 'approved');
      } else {
        await repo.updateStatus(ctx.tenantId, request.id, { currentLevel: request.currentLevel + 1 }, tx);
      }

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'approve',
          module: 'approvals',
          entityType: 'approval_request',
          entityId: request.id,
          before: { level: step.level, status: 'pending' },
          after: { level: step.level, status: 'approved', requestStatus: isFinalLevel ? 'approved' : 'pending' },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, requestId);
  },

  /**
   * Reject the current-level step (must belong to the requesting user). Immediately
   * flips the whole request AND the underlying entity to 'rejected' — rejection at
   * any level halts the workflow (no further levels are consulted).
   */
  async rejectStep(ctx: Ctx, requestId: string, stepId: string, comment?: string) {
    const request = await this.get(ctx.tenantId, requestId);
    if (request.status !== 'pending') {
      throw new UnprocessableError('Approval request is not pending', { status: request.status });
    }

    const step = request.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundError('Approval step not found');
    if (step.level !== request.currentLevel) {
      throw new ConflictError('This step is not the current level awaiting action', {
        stepLevel: step.level,
        currentLevel: request.currentLevel,
      });
    }
    if (step.status !== 'pending') {
      throw new UnprocessableError('This step has already been acted on', { status: step.status });
    }
    if (step.approverId && step.approverId !== ctx.userId) {
      throw new ForbiddenError('You are not the assigned approver for this step');
    }

    const entityType = request.entityType as EntityType;
    const entityId = (request.invoiceId ?? request.billId ?? request.expenseId ?? request.journalId) as string;

    await prisma.$transaction(async (tx) => {
      await repo.updateStep(
        ctx.tenantId,
        step.id,
        { status: 'rejected', comment: comment ?? null, actedAt: new Date() },
        tx,
      );
      await repo.updateStatus(ctx.tenantId, request.id, { status: 'rejected' }, tx);
      await flipEntityStatus(tx, ctx.tenantId, entityType, entityId, 'rejected');

      await AuditService.record(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'reject',
          module: 'approvals',
          entityType: 'approval_request',
          entityId: request.id,
          before: { level: step.level, status: 'pending' },
          after: { level: step.level, status: 'rejected', requestStatus: 'rejected', comment: comment ?? null },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return this.get(ctx.tenantId, requestId);
  },

  /** Approval history (all steps, across all requests) for a given entity, most recent first. */
  async historyForEntity(tenantId: string, entityType: EntityType, entityId: string, paging: Paging) {
    const request = await repo.findByEntity(tenantId, entityType, entityId);
    if (!request) throw new NotFoundError('No approval request found for this entity');
    const total = request.steps.length;
    const steps = [...request.steps]
      .sort((a, b) => b.level - a.level)
      .slice(paging.skip, paging.skip + paging.take);
    return [{ ...request, steps }, total] as const;
  },
};
