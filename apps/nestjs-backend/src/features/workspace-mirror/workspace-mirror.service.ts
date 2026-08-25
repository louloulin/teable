/**
 * Workspace Mirror — pure helpers (Stage 61).
 */

import type {
  IMirrorBatchResult,
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
  MirrorStatus,
} from './workspace-mirror.types';

/** ULID-ish timestamp + monotonic counter. Sufficient for in-memory tests. */
export function nextRecordId(counter: number, region: string, now: Date = new Date()): string {
  const ts = now.getTime().toString(36).padStart(9, '0');
  const c = counter.toString(36).padStart(4, '0');
  return `${ts}-${c}-${region}`;
}

/** Pure: validate a mirror config before persisting. */
export function validateMirrorConfig(cfg: IMirrorConfig): string[] {
  const errs: string[] = [];
  if (!cfg.baseId) errs.push('baseId is required');
  if (!cfg.primary.url) errs.push('primary.url is required');
  if (cfg.primary.region === '') errs.push('primary.region is required');
  if (cfg.standbys.length === 0) errs.push('at least one standby is required');
  for (const s of cfg.standbys) {
    if (s.region === cfg.primary.region) {
      errs.push(`standby region ${s.region} duplicates primary`);
    }
  }
  if (cfg.maxLagSeconds <= 0) errs.push('maxLagSeconds must be > 0');
  if (cfg.batchSize <= 0 || cfg.batchSize > 1000) errs.push('batchSize must be 1..1000');
  return errs;
}

/** Increment the next sequence number for a base. */
export function nextSeq(prevSeq: number): number {
  return prevSeq + 1;
}

/** Slice a log list into batches of `batchSize`, preserving seq order. */
export function batchRecords(
  records: ReadonlyArray<IMirrorLogRecord>,
  batchSize: number
): IMirrorLogRecord[][] {
  if (batchSize <= 0) return [];
  const out: IMirrorLogRecord[][] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    out.push(records.slice(i, i + batchSize));
  }
  return out;
}

/** Build the ack result for one batch. */
export function buildBatchResult(args: {
  batchId: string;
  region: string;
  records: ReadonlyArray<IMirrorLogRecord>;
  acknowledged: boolean;
  now?: Date;
}): IMirrorBatchResult {
  const now = args.now ?? new Date();
  const first = args.records[0];
  const last = args.records[args.records.length - 1];
  return {
    batchId: args.batchId,
    region: args.region,
    fromSeq: first?.seq ?? 0,
    toSeq: last?.seq ?? 0,
    recordCount: args.records.length,
    shippedAt: now.toISOString(),
    acknowledged: args.acknowledged,
  };
}

/** Compute lag per standby. */
export function computeLag(args: {
  region: string;
  lastAckSeq: number;
  primarySeq: number;
  shippedAt: string | null;
  maxLagSeconds: number;
  now?: Date;
}): IMirrorLag {
  const now = args.now ?? new Date();
  const seqLag = Math.max(0, args.primarySeq - args.lastAckSeq);
  const secondsLag = args.shippedAt
    ? Math.max(0, (now.getTime() - new Date(args.shippedAt).getTime()) / 1000)
    : Number.POSITIVE_INFINITY;
  const status = classifyStatus({ seqLag, secondsLag, maxLagSeconds: args.maxLagSeconds });
  return {
    region: args.region,
    lastAckSeq: args.lastAckSeq,
    primarySeq: args.primarySeq,
    seqLag,
    secondsLag,
    status,
  };
}

function classifyStatus(input: {
  seqLag: number;
  secondsLag: number;
  maxLagSeconds: number;
}): MirrorStatus {
  if (input.secondsLag === Number.POSITIVE_INFINITY) return 'broken';
  if (input.seqLag === 0) return 'idle';
  if (input.secondsLag > input.maxLagSeconds * 4) return 'paused';
  if (input.secondsLag > input.maxLagSeconds) return 'lagging';
  return 'streaming';
}

/** Roll multiple standby lags into a single promotion-readiness snapshot. */
export function summarizeLags(
  cfg: IMirrorConfig,
  lags: ReadonlyArray<IMirrorLag>
): IMirrorQueryResult {
  const safeToPromote =
    cfg.enabled &&
    lags.length === cfg.standbys.length &&
    lags.every((l) => l.status === 'idle' || l.status === 'streaming');
  return {
    baseId: cfg.baseId,
    primary: cfg.primary,
    standbys: lags,
    safeToPromote,
  };
}

/** Pick the next standby to ship to — round-robin by region priority. */
export function pickNextStandby(
  standbys: ReadonlyArray<{ region: string; priority: number }>,
  cursor: number
): { region: string; priority: number } | null {
  if (standbys.length === 0) return null;
  const ordered = [...standbys].sort((a, b) => a.priority - b.priority);
  const idx = ((cursor % ordered.length) + ordered.length) % ordered.length;
  return ordered[idx] ?? null;
}
