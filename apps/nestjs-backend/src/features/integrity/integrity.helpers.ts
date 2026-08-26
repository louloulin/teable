/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Integrity — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the link-integrity auth surface. No Nest DI, no
 * Prisma — safe to call from anywhere. Consumed by `IntegrityAuthService`.
 */

import type { ILinkIntegrityIssue, ILinkIntegritySummary } from './integrity.types';

/** Reduce a list of issues into the canonical summary shape. */
export function summarizeIssues(issues: readonly ILinkIntegrityIssue[]): ILinkIntegritySummary {
  let totalOrphans = 0;
  for (const issue of issues) {
    totalOrphans += issue.orphanCount;
  }
  return {
    totalIssues: issues.length,
    totalOrphans,
    issues,
  };
}

/** True when the summary indicates any drift that warrants repair. */
export function needsRepair(summary: ILinkIntegritySummary): boolean {
  return summary.totalIssues > 0 && summary.totalOrphans > 0;
}