/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Audit retention policy — Stage 71.
 *
 * Audit logs are valuable but expensive: org-level retention policy
 * decides which events stay "hot" (queryable in the running DB) and
 * which are moved to cold storage (S3 / OSS) or purged. The Cloud tweak
 * is per-org override — Enterprise can keep logs up to 7 years, while
 * OSS defaults to 90 days hot with a hard 7-year cold ceiling.
 */

export type RetentionTier = 'hot' | 'cold' | 'purged';
export type StorageTarget = 's3' | 'oss' | 'gcs' | 'azure-blob';

export interface IAuditRetentionPolicy {
  orgId: string;
  /** Days kept in hot storage. */
  hotDays: number;
  /** Days kept in cold storage (after which the record is purged). */
  coldDays: number;
  /** Where cold records are archived; null = no cold storage. */
  coldTarget: StorageTarget | null;
  /** Bucket / container name for cold target. */
  coldBucket: string | null;
  /** Path prefix inside the bucket. */
  coldPrefix: string | null;
  /** Optional PII redaction before cold storage. */
  redactPii: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface IAuditEvent {
  id: string;
  orgId: string;
  baseId: string | null;
  /** "row.create" | "view.share" | "automation.run" | etc. */
  action: string;
  actorId: string;
  createdAt: string;
  /** Free-form payload (JSON string in DB). */
  payload: string;
}

export interface IRetentionDecision {
  eventId: string;
  tier: RetentionTier;
  /** ISO date the decision was made. */
  decidedAt: string;
  /** Estimated days until next transition. */
  daysToNext: number;
}

export interface IRetentionJob {
  id: string;
  orgId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  scanned: number;
  promotedToCold: number;
  purged: number;
  lastError: string | null;
}

export interface IAuditRetentionOptions {
  /** Default hot days when policy missing. */
  defaultHotDays?: number;
  /** Default cold days when policy missing. */
  defaultColdDays?: number;
  /** Maximum cold days (hard ceiling). */
  maxColdDays?: number;
  /** Override "now". */
  now?: string;
}

/** Defaults. */
export const DEFAULT_HOT_DAYS = 90;
export const DEFAULT_COLD_DAYS = 365;
export const MAX_HOT_DAYS = 365;
export const MAX_COLD_DAYS = 365 * 7;
export const MAX_BATCH = 5_000;
export const STORAGE_TARGETS: ReadonlyArray<StorageTarget> = ['s3', 'oss', 'gcs', 'azure-blob'];

export const RETENTION_TIER_LABELS: Record<RetentionTier, string> = {
  hot: '热存储',
  cold: '冷存储',
  purged: '已清除',
};
