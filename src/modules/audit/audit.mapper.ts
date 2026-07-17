import type { AuditLog } from '@prisma/client';

/** AuditLog entity -> API DTO (list view — omits before/after payloads). */
export function toAuditSummaryApi(a: AuditLog) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    userId: a.userId,
    action: a.action,
    module: a.module,
    entityType: a.entityType,
    entityId: a.entityId,
    ip: a.ip,
    userAgent: a.userAgent,
    createdAt: a.createdAt.toISOString(),
  };
}

/** AuditLog entity -> API DTO (detail view — includes before/after). */
export function toAuditDetailApi(a: AuditLog) {
  return {
    ...toAuditSummaryApi(a),
    before: a.before,
    after: a.after,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  'id',
  'tenantId',
  'userId',
  'action',
  'module',
  'entityType',
  'entityId',
  'ip',
  'userAgent',
  'createdAt',
  'before',
  'after',
] as const;

/** Render a single AuditLog row as one CSV line (no trailing newline). */
export function auditLogToCsvRow(a: AuditLog): string {
  const values = [
    a.id,
    a.tenantId,
    a.userId,
    a.action,
    a.module,
    a.entityType,
    a.entityId,
    a.ip,
    a.userAgent,
    a.createdAt.toISOString(),
    a.before,
    a.after,
  ];
  return values.map(csvEscape).join(',');
}

export function auditCsvHeaderRow(): string {
  return CSV_HEADERS.join(',');
}
