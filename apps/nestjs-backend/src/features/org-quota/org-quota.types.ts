/**
 * Org-level quota orchestration — Stage 65.
 *
 * The Cloud control plane aggregates per-base quotas (Stage 12) under a
 * single org ceiling, then enforces fairness scheduling when a busy
 * base would otherwise starve quieter ones. This module owns:
 *
 *   - the per-org envelope (cap + policy + window),
 *   - a fairness scheduler that picks the next base to grant,
 *   - an overage ledger that records rejected attempts and the
 *     reason so the admin panel can show "you exceeded X by Y".
 *
 * Pure types + a pure service. The NestJS auth service wires it to
 * Prisma for persistence.
 */

export type QuotaKind =
  | 'rows'
  | 'automationRuns'
  | 'aiCredits'
  | 'attachmentBytes'
  | 'apiCallsPerMinute';

export type OveragePolicy = 'hard' | 'soft' | 'queue';

export type GrantDecision = 'allow' | 'throttle' | 'deny' | 'queue';

export interface IOrgQuotaEnvelope {
  orgId: string;
  /** Map keyed by `QuotaKind`. */
  caps: Partial<Record<QuotaKind, number | bigint | null>>;
  policy: OveragePolicy;
  /** Soft cap fraction (0..1) before throttle kicks in (policy=soft). */
  softFraction: number;
  /** Window in seconds; null = lifetime. */
  windowSeconds: number | null;
  /** Free-form notes shown in admin panel. */
  notes?: string;
}

export interface IOrgQuotaUsage {
  orgId: string;
  kind: QuotaKind;
  used: number;
  cap: number | bigint | null;
  windowStart: string;
  windowEnd: string;
}

export interface IOrgQuotaOverage {
  orgId: string;
  kind: QuotaKind;
  baseId: string;
  attemptedAt: string;
  requestedUnits: number;
  reason: string;
  decision: GrantDecision;
}

export interface IFairnessState {
  orgId: string;
  /** Weighted deficit map keyed by baseId; higher = more starved. */
  deficits: Record<string, number>;
  /** ISO timestamp of the last grant per base. */
  lastGrantByBase: Record<string, string>;
  /** Total grants issued in the current window. */
  totalGrants: number;
}

export interface IOrgQuotaCheckResult {
  orgId: string;
  kind: QuotaKind;
  decision: GrantDecision;
  /** True when the cap has been reached and policy=hard. */
  atCap: boolean;
  remaining: number | bigint | null;
  /** Friendly reason used in 429/402 responses and admin tooltips. */
  reason?: string;
}

export interface IOrgQuotaOptions {
  /** When true, allow tests to override `now`. */
  now?: Date;
  /** When provided, restrict fairness scheduling to these bases. */
  candidateBaseIds?: ReadonlyArray<string>;
}

export const DEFAULT_ORG_SOFT_FRACTION = 0.85;
export const DEFAULT_ORG_POLICY: OveragePolicy = 'soft';
export const MAX_ORG_QUOTA_KINDS = 16;
export const FAIRNESS_DECAY = 0.95;
export const FAIRNESS_BOOST = 1.0;

/** Keys allowed on the cap map. */
export const ORG_QUOTA_KINDS: ReadonlyArray<QuotaKind> = [
  'rows',
  'automationRuns',
  'aiCredits',
  'attachmentBytes',
  'apiCallsPerMinute',
];

/** Friendly label per kind (used by admin UI). */
export const ORG_QUOTA_LABELS: Record<QuotaKind, string> = {
  rows: '总行数',
  automationRuns: '自动化运行',
  aiCredits: 'AI 信用',
  attachmentBytes: '附件字节',
  apiCallsPerMinute: 'API 每分钟调用',
};
