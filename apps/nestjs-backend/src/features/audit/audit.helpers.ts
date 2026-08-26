/**
 * Audit — thin-DI wrapper (Stage N).
 *
 * Pure helpers used by the audit auth surface to filter and normalise
 * audit rows. No Prisma, no Nest DI.
 */

import type { IAuditListFilter, IAuditLogRow } from './audit.types';

/** Format a wire-friendly audit action: lower-case and collapse dashes. */
export function formatAuditAction(action: string): string {
  return action.trim().toLowerCase().replace(/[-\s]+/g, '.');
}

/** True when the row passes the filter; helper to keep `findMany` callers trivial. */
export function matchesAuditFilter(row: IAuditLogRow, filter: IAuditListFilter): boolean {
  if (filter.action && row.action !== filter.action) return false;
  if (filter.resourceId && row.resourceId !== filter.resourceId) return false;
  return true;
}

/** Clamp the requested limit into the [1, 1000] window. */
export function clampAuditLimit(requested: number | undefined): number {
  if (!requested || requested < 1) return 100;
  return Math.min(requested, 1_000);
}
