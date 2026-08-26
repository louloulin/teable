/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Integrity — thin-DI wrapper (Stage N).
 *
 * Minimal types for the link-integrity auth surface. The full integrity
 * scan / repair flow stays in `link-integrity.service.ts`; this module
 * only declares the shapes needed by `IntegrityAuthService`.
 */

export interface ILinkIntegrityIssue {
  linkFieldId: string;
  symmetricFieldId: string;
  /** Number of orphan records detected in the latest scan. */
  orphanCount: number;
}

export interface ILinkIntegritySummary {
  totalIssues: number;
  totalOrphans: number;
  issues: readonly ILinkIntegrityIssue[];
}