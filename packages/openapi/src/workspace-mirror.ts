/**
 * Workspace Mirror / DR replica — shared wire contract.
 *
 * These interfaces are the single definition site for the mirror shapes.
 * They live in `@teable/openapi` (rather than inside the backend feature
 * folder) because both sides of the wire need them: the Nest controller in
 * `apps/nestjs-backend/src/features/workspace-mirror` and the Next.js
 * workspace-switcher UI. `workspace-mirror.types.ts` in the backend
 * re-exports from here, so existing backend imports keep working.
 *
 * Reverse of the read-routing work: the mirror captures each primary write
 * as a logical log record, batches it for the standby, and tracks per-region
 * replay lag so we can answer "is the standby safe to promote?".
 */

export type MirrorStatus = 'idle' | 'streaming' | 'lagging' | 'paused' | 'broken';

export interface IRegionEndpoint {
  region: string;
  url: string;
  /** Lower = preferred when picking a writer. */
  priority: number;
}

export interface IMirrorConfig {
  baseId: string;
  /** Primary region we replicate from. */
  primary: IRegionEndpoint;
  /** Standby regions we replicate to. */
  standbys: ReadonlyArray<IRegionEndpoint>;
  /** Maximum tolerated lag (seconds) before we mark `lagging`. */
  maxLagSeconds: number;
  /** Soft cap for the batch size. */
  batchSize: number;
  /** When false, writes are still captured but not shipped. */
  enabled: boolean;
}

export interface IMirrorLogRecord {
  /** ULID-style monotonically-increasing identifier. */
  id: string;
  baseId: string;
  region: string;
  /** Logical write op — `kind` is domain-specific. */
  kind: string;
  /** Free-form payload; consumers deserialize by kind. */
  payload: unknown;
  /** Sequence number within the primary region. */
  seq: number;
  recordedAt: string;
}

export interface IMirrorBatchResult {
  batchId: string;
  region: string;
  /** Sequence range shipped. */
  fromSeq: number;
  toSeq: number;
  recordCount: number;
  shippedAt: string;
  /** When true, the standby acknowledged the batch. */
  acknowledged: boolean;
}

export interface IMirrorLag {
  region: string;
  /** Latest sequence the standby has acknowledged. */
  lastAckSeq: number;
  /** Latest sequence the primary has produced. */
  primarySeq: number;
  /** Difference between primary seq and last ack seq. */
  seqLag: number;
  /** Wall-clock lag in seconds (most recent batch shipped_at - now). */
  secondsLag: number;
  status: MirrorStatus;
}

export interface IMirrorQueryResult {
  baseId: string;
  primary: IRegionEndpoint;
  standbys: ReadonlyArray<IMirrorLag>;
  /** True when every standby lag is below `maxLagSeconds`. */
  safeToPromote: boolean;
}
