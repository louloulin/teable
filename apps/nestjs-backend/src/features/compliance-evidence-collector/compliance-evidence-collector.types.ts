/**
 * Compliance Evidence Collector — types (Stage 123).
 *
 * Collects and aggregates compliance evidence from logs / reviews / configs.
 */

import { EvidenceKind } from '../compliance-control-map/compliance-control-map.types';

export interface EvidenceRecord {
  /** Globally unique id. */
  id: string;
  /** Control id this evidence satisfies. */
  controlId: string;
  /** Evidence kind. */
  kind: EvidenceKind;
  /** ISO timestamp when collected. */
  collectedAt: string;
  /** ISO range covered by this evidence. */
  coversFrom: string;
  coversTo: string;
  /** Free-form metadata about the source. */
  source: string;
  /** Hash of the captured content. */
  contentHash: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** Optional inline snippet (e.g. first 256 chars). */
  snippet?: string;
}

export interface EvidenceCollectorOptions {
  /** Look back window in days. */
  windowDays: number;
  /** When true, dedupe by content hash. */
  dedupe?: boolean;
  /** Maximum records per control. */
  maxPerControl?: number;
}

export interface CollectionResult {
  records: readonly EvidenceRecord[];
  /** Records that were deduped (hash collisions). */
  deduped: number;
  /** Total candidates considered. */
  candidates: number;
  /** Time taken (ms). */
  durationMs: number;
}

export interface EvidenceQuery {
  controlId?: string;
  kind?: EvidenceKind;
  from?: string;
  to?: string;
}

export const EVIDENCE_ID_RE = /^evi_[a-z0-9]{8,}$/;
export const DEFAULT_EVIDENCE_WINDOW_DAYS = 90;
export const DEFAULT_MAX_PER_CONTROL = 1000;