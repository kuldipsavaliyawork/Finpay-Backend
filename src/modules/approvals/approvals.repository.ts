import { Prisma, type PrismaClient, type ApprovalRequest, type ApprovalStep } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type ApprovalRequestWithSteps = ApprovalRequest & { steps: ApprovalStep[] };

export interface ListApprovalRequestArgs {
  skip: number;
  take: number;
  status?: string;
  entityType?: string;
  requestedBy?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'currentLevel';
  sortDir?: 'asc' | 'desc';
}

function requestWhere(
  tenantId: string,
  a: { status?: string; entityType?: string; requestedBy?: string },
): Prisma.ApprovalRequestWhereInput {
  const where: Prisma.ApprovalRequestWhereInput = { tenantId };
  if (a.status) where.status = a.status;
  if (a.entityType) where.entityType = a.entityType;
  if (a.requestedBy) where.requestedBy = a.requestedBy;
  return where;
}

const includeSteps = { steps: { orderBy: { level: 'asc' as const } } };

/**
 * Approvals repository — all Prisma access for ApprovalRequest + ApprovalStep,
 * ALWAYS tenant-scoped.
 */
export const approvalsRepository = {
  list(tenantId: string, a: ListApprovalRequestArgs, db: Db = prisma): Promise<ApprovalRequestWithSteps[]> {
    return db.approvalRequest.findMany({
      where: requestWhere(tenantId, a),
      skip: a.skip,
      take: a.take,
      orderBy: { [a.sortBy ?? 'createdAt']: a.sortDir ?? 'desc' },
      include: includeSteps,
    });
  },

  count(tenantId: string, a: { status?: string; entityType?: string; requestedBy?: string }, db: Db = prisma): Promise<number> {
    return db.approvalRequest.count({ where: requestWhere(tenantId, a) });
  },

  findById(tenantId: string, id: string, db: Db = prisma): Promise<ApprovalRequestWithSteps | null> {
    return db.approvalRequest.findFirst({
      where: { id, tenantId },
      include: includeSteps,
    });
  },

  /** Find an existing approval request for a given entity (each entity has at most one). */
  findByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    db: Db = prisma,
  ): Promise<ApprovalRequestWithSteps | null> {
    const where: Prisma.ApprovalRequestWhereInput = { tenantId, entityType };
    if (entityType === 'invoice') where.invoiceId = entityId;
    else if (entityType === 'bill') where.billId = entityId;
    else if (entityType === 'expense') where.expenseId = entityId;
    else if (entityType === 'journal') where.journalId = entityId;
    return db.approvalRequest.findFirst({ where, include: includeSteps });
  },

  create(
    data: Prisma.ApprovalRequestUncheckedCreateInput & { steps: Prisma.ApprovalStepCreateManyRequestInput[] },
    db: Db = prisma,
  ): Promise<ApprovalRequestWithSteps> {
    const { steps, ...rest } = data;
    return db.approvalRequest.create({
      data: { ...rest, steps: { createMany: { data: steps } } },
      include: includeSteps,
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    data: { status?: string; currentLevel?: number },
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.approvalRequest.updateMany({ where: { id, tenantId }, data });
  },

  findStepById(tenantId: string, stepId: string, db: Db = prisma): Promise<ApprovalStep | null> {
    return db.approvalStep.findFirst({ where: { id: stepId, tenantId } });
  },

  findStep(tenantId: string, requestId: string, level: number, db: Db = prisma): Promise<ApprovalStep | null> {
    return db.approvalStep.findFirst({ where: { tenantId, requestId, level } });
  },

  updateStep(
    tenantId: string,
    stepId: string,
    data: Prisma.ApprovalStepUpdateInput,
    db: Db = prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.approvalStep.updateMany({ where: { id: stepId, tenantId }, data });
  },

  /** Steps at the request's current level, assigned to a given approver, still pending. */
  findPendingStepsForApprover(
    tenantId: string,
    approverId: string,
    a: { skip: number; take: number; entityType?: string },
    db: Db = prisma,
  ): Promise<ApprovalRequestWithSteps[]> {
    const where: Prisma.ApprovalRequestWhereInput = {
      tenantId,
      status: 'pending',
      ...(a.entityType ? { entityType: a.entityType } : {}),
      steps: { some: { approverId, status: 'pending' } },
    };
    return db.approvalRequest.findMany({
      where,
      skip: a.skip,
      take: a.take,
      orderBy: { createdAt: 'asc' },
      include: includeSteps,
    });
  },

  countPendingStepsForApprover(
    tenantId: string,
    approverId: string,
    a: { entityType?: string },
    db: Db = prisma,
  ): Promise<number> {
    const where: Prisma.ApprovalRequestWhereInput = {
      tenantId,
      status: 'pending',
      ...(a.entityType ? { entityType: a.entityType } : {}),
      steps: { some: { approverId, status: 'pending' } },
    };
    return db.approvalRequest.count({ where });
  },
};
