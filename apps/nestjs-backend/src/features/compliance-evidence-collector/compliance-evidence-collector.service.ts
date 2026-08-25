/**
 * Compliance Evidence Collector — pure helpers (Stage 123).
 */

import { createHash } from 'node:crypto';

import {
  CollectionResult,
  DEFAULT_EVIDENCE_WINDOW_DAYS,
  DEFAULT_MAX_PER_CONTROL,
  EvidenceCollectorOptions,
  EvidenceQuery,
  EvidenceRecord,
} from './compliance-evidence-collector.types';

/** Compute a stable evidence id from control + kind + content hash. */
export function buildEvidenceId(controlId: string, kind: string, contentHash: string): string {
  return `evi_${hashStr(`${controlId}:${kind}:${contentHash}`).padStart(8, '0').slice(0, 8)}`;
}

/** Hash arbitrary content (string or bytes). */
export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Validate an evidence id. */
export function isEvidenceIdValid(id: string): boolean {
  return /^evi_[a-z0-9]{8,}$/.test(id);
}

/** Filter records by query. */
export function filterRecords(records: readonly EvidenceRecord[], query: EvidenceQuery): EvidenceRecord[] {
  return records.filter((r) => {
    if (query.controlId && r.controlId !== query.controlId) return false;
    if (query.kind && r.kind !== query.kind) return false;
    if (query.from && r.collectedAt < query.from) return false;
    if (query.to && r.collectedAt > query.to) return false;
    return true;
  });
}

/** Collect evidence from raw candidates + control requirements. */
export function collectEvidence(input: {
  candidates: readonly { controlId: string; kind: EvidenceRecord['kind']; content: string | Uint8Array; source: string; collectedAt?: string }[];
  options?: EvidenceCollectorOptions;
  now?: string;
}): CollectionResult {
  const start = Date.now();
  const opts = { windowDays: DEFAULT_EVIDENCE_WINDOW_DAYS, maxPerControl: DEFAULT_MAX_PER_CONTROL, dedupe: true, ...input.options };
  const now = input.now ?? new Date().toISOString();
  const cutoff = new Date(Date.now() - opts.windowDays * 86400 * 1000).toISOString();
  const records: EvidenceRecord[] = [];
  const seen = new Map<string, true>();
  let deduped = 0;
  const perControl = new Map<string, number>();
  for (const c of input.candidates) {
    const collectedAt = c.collectedAt ?? now;
    if (collectedAt < cutoff) continue;
    const h = hashContent(typeof c.content === 'string' ? c.content : Buffer.from(c.content));
    if (opts.dedupe) {
      if (seen.has(h)) {
        deduped++;
        continue;
      }
      seen.set(h, true);
    }
    const count = perControl.get(c.controlId) ?? 0;
    if (count >= opts.maxPerControl) continue;
    perControl.set(c.controlId, count + 1);
    const rec: EvidenceRecord = {
      id: buildEvidenceId(c.controlId, c.kind, h),
      controlId: c.controlId,
      kind: c.kind,
      collectedAt,
      coversFrom: cutoff,
      coversTo: now,
      source: c.source,
      contentHash: h,
      sizeBytes: typeof c.content === 'string' ? Buffer.byteLength(c.content) : c.content.byteLength,
      snippet: typeof c.content === 'string' ? c.content.slice(0, 256) : Buffer.from(c.content).toString('base64').slice(0, 256),
    };
    records.push(rec);
  }
  return { records, deduped, candidates: input.candidates.length, durationMs: Date.now() - start };
}

/** Group evidence by control. */
export function groupByControl(records: readonly EvidenceRecord[]): Record<string, EvidenceRecord[]> {
  const out: Record<string, EvidenceRecord[]> = {};
  for (const r of records) {
    if (!out[r.controlId]) out[r.controlId] = [];
    out[r.controlId].push(r);
  }
  return out;
}

/** Build a present-evidence set (controlId → Set<EvidenceKind>) for the missing-evidence report. */
export function presentEvidence(records: readonly EvidenceRecord[]): Map<string, Set<import('../compliance-control-map/compliance-control-map.types').EvidenceKind>> {
  const out = new Map<string, Set<import('../compliance-control-map/compliance-control-map.types').EvidenceKind>>();
  for (const r of records) {
    if (!out.has(r.controlId)) out.set(r.controlId, new Set());
    out.get(r.controlId)!.add(r.kind);
  }
  return out;
}

/** Aggregate evidence totals. */
export function totals(records: readonly EvidenceRecord[]): { count: number; bytes: number; controls: number } {
  const bytes = records.reduce((s, r) => s + r.sizeBytes, 0);
  const controls = new Set(records.map((r) => r.controlId)).size;
  return { count: records.length, bytes, controls };
}

/** Decide if a collected record is fresh enough. */
export function isFresh(record: EvidenceRecord, now: string = new Date().toISOString()): boolean {
  return record.collectedAt <= now;
}

/** Drop stale records. */
export function dropStale(records: readonly EvidenceRecord[], now: string): EvidenceRecord[] {
  return records.filter((r) => isFresh(r, now));
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16);
}