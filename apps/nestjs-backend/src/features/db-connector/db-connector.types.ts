/**
 * Database connector — Stage 48.
 *
 * A `DbConnector` describes a remote database a base can pull data
 * from. Each connector stores an `encryptedConfigJson` blob (handled
 * by an external KMS in production; Stage 48 keeps it pass-through).
 * A `DbConnectorSync` records the result of a sync run, including
 * status, row counts, and an optional error message.
 *
 * Supported source kinds: postgres, mysql, mongodb, bigquery,
 * snowflake, rest-api (CSV/JSON endpoints), notion, airtable.
 */

export type DbConnectorKind =
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'bigquery'
  | 'snowflake'
  | 'rest-api'
  | 'notion'
  | 'airtable';

export type DbConnectorSyncStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type DbConnectorSyncMode = 'full' | 'incremental' | 'manual';

export interface IDbConnector {
  id: string;
  baseId: string;
  name: string;
  kind: DbConnectorKind;
  /// Opaque encrypted blob (KMS-bound in production).
  encryptedConfigJson: string;
  /// When set, this is the key into the connector config to filter
  /// the dataset on (e.g. `updated_at > lastSyncedAt`).
  incrementalField?: string;
  /// Cron-style sync schedule (e.g. '*/15 * * * *'); '' = manual-only.
  schedule: string;
  /// Destination table id; empty means the connector is un-bound.
  targetTableId: string;
  enabled: boolean;
  lastSyncAt?: Date;
  createdTime: Date;
  updatedTime: Date;
}

export interface IDbConnectorSync {
  id: string;
  connectorId: string;
  mode: DbConnectorSyncMode;
  status: DbConnectorSyncStatus;
  /// Number of rows fetched from the remote source.
  rowsFetched: number;
  /// Number of rows written to the destination table.
  rowsWritten: number;
  startedAt: Date;
  finishedAt?: Date;
  errorMessage?: string;
}

export interface ICreateConnectorInput {
  baseId: string;
  name: string;
  kind: DbConnectorKind;
  config: Record<string, unknown>;
  incrementalField?: string;
  schedule?: string;
  targetTableId?: string;
  enabled?: boolean;
}

export interface ITestConnectionInput {
  kind: DbConnectorKind;
  config: Record<string, unknown>;
}

export interface ITestConnectionResult {
  ok: boolean;
  /// Estimated latency in ms; -1 when not measured.
  latencyMs: number;
  /// Driver-reported version (e.g. 'PostgreSQL 14.5').
  serverVersion?: string;
  error?: string;
}

export interface IStartSyncInput {
  connectorId: string;
  mode?: DbConnectorSyncMode;
  triggeredBy: string;
}

export const DEFAULT_CONNECTOR_NAME_MAX_LENGTH = 80;
export const DEFAULT_SCHEDULE_MAX_LENGTH = 64;
export const DEFAULT_PAGE_SIZE = 200;
