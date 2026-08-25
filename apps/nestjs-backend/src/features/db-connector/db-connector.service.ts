/**
 * Database connector — Stage 48.
 *
 * Pure helpers: connector validation, schema-derived envelope
 * checks, sync-status state machine, schedule parsing, config
 * shape rules per kind. DB-touching work is delegated to
 * DbConnectorAuthService.
 */

import type {
  DbConnectorKind,
  DbConnectorSyncMode,
  DbConnectorSyncStatus,
  ICreateConnectorInput,
  IDbConnector,
  IDbConnectorSync,
  IStartSyncInput,
  ITestConnectionInput,
  ITestConnectionResult,
} from './db-connector.types';
import {
  DEFAULT_CONNECTOR_NAME_MAX_LENGTH,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCHEDULE_MAX_LENGTH,
} from './db-connector.types';

export function isValidKind(s: string): s is DbConnectorKind {
  return (
    s === 'postgres' ||
    s === 'mysql' ||
    s === 'mongodb' ||
    s === 'bigquery' ||
    s === 'snowflake' ||
    s === 'rest-api' ||
    s === 'notion' ||
    s === 'airtable'
  );
}

export function isValidSyncMode(m: string): m is DbConnectorSyncMode {
  return m === 'full' || m === 'incremental' || m === 'manual';
}

export function isValidSyncStatus(s: string): s is DbConnectorSyncStatus {
  return (
    s === 'pending' ||
    s === 'running' ||
    s === 'success' ||
    s === 'partial' ||
    s === 'failed' ||
    s === 'cancelled'
  );
}

export function validateCreateInput(input: ICreateConnectorInput): void {
  if (!isValidKind(input.kind)) throw new Error(`invalid kind: ${input.kind}`);
  if (!input.baseId) throw new Error('baseId required');
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('name required');
  }
  if (input.name.length > DEFAULT_CONNECTOR_NAME_MAX_LENGTH) {
    throw new Error(`name too long (max ${DEFAULT_CONNECTOR_NAME_MAX_LENGTH})`);
  }
  validateConfigShape(input.kind, input.config);
  if (input.schedule && input.schedule.length > DEFAULT_SCHEDULE_MAX_LENGTH) {
    throw new Error(`schedule too long (max ${DEFAULT_SCHEDULE_MAX_LENGTH})`);
  }
}

export function validateConfigShape(kind: DbConnectorKind, config: Record<string, unknown>): void {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('config must be a plain object');
  }
  const required = requiredConfigKeys(kind);
  for (const k of required) {
    if (config[k] === undefined || config[k] === null || config[k] === '') {
      throw new Error(`config.${k} required for kind=${kind}`);
    }
  }
}

function requiredConfigKeys(kind: DbConnectorKind): readonly string[] {
  switch (kind) {
    case 'postgres':
      return ['host', 'port', 'database', 'user', 'password'];
    case 'mysql':
      return ['host', 'port', 'database', 'user', 'password'];
    case 'mongodb':
      return ['connectionString'];
    case 'bigquery':
      return ['projectId', 'datasetId', 'credentialsJson'];
    case 'snowflake':
      return ['account', 'warehouse', 'database', 'user', 'password'];
    case 'rest-api':
      return ['url'];
    case 'notion':
      return ['integrationToken', 'databaseId'];
    case 'airtable':
      return ['apiKey', 'baseId', 'tableId'];
  }
}

/**
 * Light schedule validation: a 5-field cron string (or '' for manual).
 * Each field must be present and either '*' or a numeric range.
 */
export function isValidSchedule(s: string): boolean {
  if (s === '') return true;
  const parts = s.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every(isValidScheduleField);
}

function isValidScheduleField(f: string): boolean {
  if (f === '*') return true;
  if (/^\*\/\d+$/.test(f)) return true;
  if (/^\d+$/.test(f)) return true;
  if (/^\d+-\d+$/.test(f)) return true;
  return false;
}

export function validateStartSyncInput(input: IStartSyncInput): void {
  if (!input.connectorId) throw new Error('connectorId required');
  if (!input.triggeredBy) throw new Error('triggeredBy required');
  if (input.mode && !isValidSyncMode(input.mode)) {
    throw new Error(`invalid mode: ${input.mode}`);
  }
}

/**
 * The connector can be synced when enabled, target is bound,
 * and not currently running.
 */
export function canStartSync(
  connector: IDbConnector,
  lastSync: IDbConnectorSync | undefined,
  now: Date = new Date()
): { ok: boolean; reason?: string } {
  if (!connector.enabled) return { ok: false, reason: 'connector disabled' };
  if (!connector.targetTableId) {
    return { ok: false, reason: 'target table not bound' };
  }
  if (lastSync && lastSync.status === 'running') {
    return { ok: false, reason: 'sync already running' };
  }
  if (lastSync && lastSync.finishedAt) {
    const ageMs = now.getTime() - lastSync.finishedAt.getTime();
    if (ageMs < 0) return { ok: false, reason: 'last sync finished in the future' };
  }
  return { ok: true };
}

/**
 * Reduce a fetch/write pair to a final sync status.
 *  - any write failure ⇒ failed
 *  - rowsFetched > 0 with rowsWritten < rowsFetched ⇒ partial
 *  - rowsWritten === rowsFetched > 0 ⇒ success
 *  - zero rows ⇒ success (no-op is success)
 */
export function deriveSyncStatus(
  rowsFetched: number,
  rowsWritten: number,
  hadError: boolean
): DbConnectorSyncStatus {
  if (hadError) return 'failed';
  if (rowsFetched === 0) return 'success';
  if (rowsWritten < rowsFetched) return 'partial';
  return 'success';
}

/** Compute page size for a sync run. */
export function resolvePageSize(input: { pageSize?: number }): number {
  if (!input.pageSize || input.pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(input.pageSize, 5000);
}

/** Pure test-connection shape. Auth service fills latency/serverVersion. */
export function testConnectionConfig(input: ITestConnectionInput): ITestConnectionResult {
  try {
    validateConfigShape(input.kind, input.config);
    return { ok: true, latencyMs: -1 };
  } catch (e) {
    return { ok: false, latencyMs: -1, error: (e as Error).message };
  }
}

/** True when the supplied sync has reached a terminal status. */
export function isTerminalStatus(s: DbConnectorSyncStatus): boolean {
  return s === 'success' || s === 'partial' || s === 'failed' || s === 'cancelled';
}

/** True when a manual run is allowed (terminal status or no prior sync). */
export function isManualRunAllowed(s: IDbConnectorSync | undefined): boolean {
  if (!s) return true;
  return isTerminalStatus(s.status);
}
