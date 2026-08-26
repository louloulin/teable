/**
 * Audit — thin-DI wrapper (Stage N).
 *
 * Minimal types for the read-side of the audit log. The write side
 * (AuditScope.emitAtomic, AuditLogService.record) remains in `audit-scope.ts`
 * / `audit-log.service.ts`; this surface exposes a stable list shape for
 * downstream readers (admin UIs, dashboards, etc.).
 */

export interface IAuditLogRow {
  id: string;
  action: string;
  resourceId: string;
  userId: string | null;
  rootAction: string | null;
  operationId: string | null;
  createdAt: Date;
}

export interface IAuditListFilter {
  action?: string;
  resourceId?: string;
  /** Max rows to return. Defaults to 100; hard-capped at 1000. */
  limit?: number;
}

export interface IAuditListResult {
  rows: IAuditLogRow[];
  nextCursor: string | null;
}
