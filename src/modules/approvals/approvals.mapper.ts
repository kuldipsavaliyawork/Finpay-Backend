import type { ApprovalStep } from '@prisma/client';
import type { ApprovalRequestWithSteps } from './approvals.repository';

function stepApi(s: ApprovalStep) {
  return {
    id: s.id,
    level: s.level,
    approverId: s.approverId,
    status: s.status,
    comment: s.comment,
    actedAt: s.actedAt ? s.actedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

/** ApprovalRequest entity -> API DTO. */
export function toApprovalRequestApi(req: ApprovalRequestWithSteps) {
  return {
    id: req.id,
    entityType: req.entityType,
    entityId: req.invoiceId ?? req.billId ?? req.expenseId ?? req.journalId ?? null,
    status: req.status,
    currentLevel: req.currentLevel,
    totalLevels: req.totalLevels,
    requestedBy: req.requestedBy,
    steps: req.steps.map(stepApi),
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
  };
}

export type ApprovalRequestApi = ReturnType<typeof toApprovalRequestApi>;
