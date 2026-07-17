import { NotFoundError } from '../../common/errors';
import { auditRepository as repo } from './audit.repository';
import { auditLogToCsvRow, auditCsvHeaderRow } from './audit.mapper';
import type { AuditFilters } from './audit.dto';
import type { Paging } from '../../common/pagination/pagination';

const DEFAULT_EXPORT_LIMIT = 10_000;

/**
 * Read-only audit service. AuditLog rows are written exclusively via
 * AuditService.record(...) (src/common/middleware/audit.ts) from other
 * modules' services — this module never creates/updates/deletes rows.
 */
export const auditService = {
  async list(
    tenantId: string,
    paging: Paging,
    filters: AuditFilters & { sortDir?: 'asc' | 'desc' },
  ) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { skip: paging.skip, take: paging.take, ...filters }),
      repo.count(tenantId, filters),
    ]);
    return [items, total] as const;
  },

  async get(tenantId: string, id: string) {
    const log = await repo.findById(tenantId, id);
    if (!log) throw new NotFoundError('Audit log entry not found');
    return log;
  },

  /** Stream-friendly CSV generation: header + rows joined by CRLF, capped by `limit`. */
  async exportCsv(tenantId: string, filters: AuditFilters, limit?: number): Promise<string> {
    const rows = await repo.listForExport(tenantId, filters, limit ?? DEFAULT_EXPORT_LIMIT);
    const lines = [auditCsvHeaderRow(), ...rows.map(auditLogToCsvRow)];
    return lines.join('\r\n');
  },
};
