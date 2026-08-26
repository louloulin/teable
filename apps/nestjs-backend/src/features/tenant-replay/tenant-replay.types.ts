/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tenant Replay — shared types.
 *
 * The replay harness models a captured tenant as a JSON document that can be
 * restored into a fresh OSS environment for debugging, support, or migration
 * dry-runs.  These types define the shape of that document plus the options
 * and report exchanged with the replay service.
 *
 * NOTE — keep these types dependency-free so the JSON snapshot stays
 * serialisable.  Domain types from `@teable/openapi` are referenced as
 * `IFieldRo`-shaped JSON (Record<string, unknown>) on purpose.
 */

/**
 * The PII scrubbing policy applied to a snapshot before it leaves the source
 * environment.  `none` keeps emails, names and display strings verbatim;
 * `scrub` replaces them with deterministic placeholders so the snapshot is
 * safe to share with third parties.
 */
export type IAnonymizePolicy = 'none' | 'scrub';

/**
 * Optional knobs that the replay operator can set to scope how much of the
 * captured snapshot is restored and how it is restored.
 */
export interface IReplayOptions {
  /**
   * Name of the destination space.  Defaults to the original space name with
   * a `(replay)` suffix.
   */
  targetSpaceName?: string;

  /**
   * Anonymisation policy applied on restore.  Defaults to `scrub` so a replay
   * never echoes real user names / emails into a sandbox.
   */
  anonymize?: IAnonymizePolicy;

  /**
   * Maximum number of mock records inserted per table.  Captured snapshots do
   * NOT carry record bodies (only counts) — replay always seeds a fresh batch
   * via the test seed pattern.
   */
  rowsPerTable?: number;

  /**
   * If true, the schema-op runner is kicked after replay so any queued
   * `SchemaOperation` rows are processed against the new space.  Defaults to
   * `true`.
   */
  runSchemaOperations?: boolean;

  /**
   * If true, the harness will fail fast on the first error.  Defaults to
   * `false` — the report carries the error stream so a partial restore is
   * still useful for debugging.
   */
  failFast?: boolean;
}

/**
 * Per-table record counts captured from the source space.  We deliberately do
 * NOT carry record bodies — the harness is for shape / volume, not data
 * fidelity.
 */
export interface ITableRecordStats {
  /** Cuid of the source table. */
  sourceTableId: string;
  /** Display name of the source table. */
  name: string;
  /** Approximate number of rows (excluding soft-deletes) in the source. */
  rowCount: number;
  /** Field ids in the original table. */
  fieldIds: string[];
}

/**
 * Per-base shape captured from the source space.
 */
export interface IBaseSnapshot {
  sourceBaseId: string;
  name: string;
  icon?: string | null;
  order: number;
  tables: ITableSnapshot[];
  collaboratorCount: number;
  automationRunCount: number;
}

/**
 * Per-table shape.  Field shape is kept opaque (Record<string, unknown>) so
 * the snapshot survives `@teable/core` schema changes — the replay service
 * forwards the raw payload to the field open-api service, which validates it
 * against the current `IFieldRo` contract.
 */
export interface ITableSnapshot {
  sourceTableId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  dbTableName: string;
  order: number;
  fields: Array<Record<string, unknown>>;
  views: Array<Record<string, unknown>>;
  /** Per-table record counts — bodies are NOT captured. */
  recordStats: ITableRecordStats;
  /** Captured schema operations queued against the source table. */
  pendingSchemaOperations: number;
  /** Captured attachment rows (metadata only, file bytes skipped). */
  attachmentCount: number;
}

/**
 * Per-user shape captured from the source space.  PII fields are scrubbed on
 * capture when the policy is `scrub`.
 */
export interface IUserSnapshot {
  sourceUserId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isSystem: boolean;
}

/**
 * The captured document.  Stored to disk as JSON by the capture CLI and
 * loaded by the restore CLI.
 */
export interface ITenantSnapshot {
  /** Schema version — bumped if the snapshot format changes. */
  version: 1;
  /** ISO-8601 timestamp of capture. */
  capturedAt: string;
  /** Identifier of the operator / system that produced the snapshot. */
  capturedBy?: string;
  /** Anonymisation policy applied at capture time. */
  anonymized: IAnonymizePolicy;
  /** Original space id (informational only — replay allocates a new one). */
  sourceSpaceId: string;
  spaceName: string;
  bases: IBaseSnapshot[];
  users: IUserSnapshot[];
  /** Flat count summary for quick inspection. */
  summary: {
    baseCount: number;
    tableCount: number;
    viewCount: number;
    fieldCount: number;
    userCount: number;
    schemaOperationCount: number;
    attachmentCount: number;
    approxRecordCount: number;
  };
}

/**
 * Single error entry captured during replay.  Kept small so the report
 * remains easy to scan.
 */
export interface IReplayError {
  phase: 'space' | 'base' | 'table' | 'field' | 'records' | 'schema-ops';
  sourceId?: string;
  message: string;
  stack?: string;
}

/**
 * Per-phase counters the replay service emits while it runs.
 */
export interface IReplayCounts {
  spacesCreated: number;
  basesCreated: number;
  tablesCreated: number;
  fieldsCreated: number;
  viewsCreated: number;
  recordsSeeded: number;
  schemaOperationsProcessed: number;
  schemaOperationsFailed: number;
}

/**
 * The final report returned by `TenantReplayService.replay`.  Carries enough
 * detail for a developer to decide whether to re-run with different options,
 * plus enough breadcrumbs to reproduce the new space.
 */
export interface IReplayReport {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  snapshot: {
    version: number;
    sourceSpaceId: string;
  };
  options: Required<IReplayOptions>;
  counts: IReplayCounts;
  /** New space id produced by the replay run. */
  newSpaceId?: string;
  /** Map from source base id → new base id. */
  baseIdMap: Record<string, string>;
  /** Map from source table id → new table id. */
  tableIdMap: Record<string, string>;
  errors: IReplayError[];
}
