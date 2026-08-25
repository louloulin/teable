/**
 * Airtable bi-directional sync — Stage 36 types.
 *
 * Airtable Connection + Table Mapping + per-row SyncRecord
 * + per-run SyncLog. Field mapping is a JSON object that maps
 * Airtable column names → Teable fieldIds.
 */

export type SyncDirection = 'one-way-push' | 'one-way-pull' | 'bi-directional';

export type MappingStatus = 'ready' | 'paused' | 'error';

export type SyncRecordState = 'synced' | 'remote-only' | 'local-only' | 'conflict';

export type SyncRunDirection = 'push' | 'pull' | 'conflict-resolved';

export type SyncRunStatus = 'ok' | 'failed' | 'partial';

export interface IAirtableFieldMap {
  /** Airtable field name → Teable fieldId. */
  [airtableFieldName: string]: string;
}

export interface IAirtableConnection {
  id: string;
  organizationId: string;
  baseId: string;
  baseName: string;
  accessTokenJson: string;
  grantedScopes: string | null;
  connectedBy: string;
  connectedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}

export interface IAirtableTableMapping {
  id: string;
  connectionId: string;
  airtableTableId: string;
  airtableTableName: string;
  teableBaseId: string;
  teableTableId: string;
  direction: SyncDirection;
  status: MappingStatus;
  fieldMapJson: string;
  fieldMapHash: string;
  lastSyncedTime: Date | null;
  lastErrorMessage: string | null;
  createdTime: Date;
  updatedTime: Date;
}

export interface IAirtableSyncRecord {
  id: string;
  mappingId: string;
  airtableRecordId: string;
  teableRecordId: string;
  state: SyncRecordState;
  lastRemoteVersion: number | null;
  lastLocalVersion: number | null;
  lastSyncedAt: Date | null;
  lastHash: string | null;
}

export interface IAirtableSyncLog {
  id: string;
  mappingId: string;
  direction: SyncRunDirection;
  recordsExamined: number;
  recordsCreated: number;
  recordsUpdated: number;
  conflictsFound: number;
  status: SyncRunStatus;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface ICreateConnectionInput {
  organizationId: string;
  baseId: string;
  baseName: string;
  accessTokenJson: string;
  connectedBy: string;
  grantedScopes?: string | null;
}

export interface ICreateMappingInput {
  connectionId: string;
  airtableTableId: string;
  airtableTableName: string;
  teableBaseId: string;
  teableTableId: string;
  direction?: SyncDirection;
  fieldMap: IAirtableFieldMap;
}

export interface IUpdateMappingInput {
  direction?: SyncDirection;
  status?: MappingStatus;
  fieldMap?: IAirtableFieldMap;
  lastErrorMessage?: string | null;
}

export interface ISyncCandidate {
  airtableRecordId: string;
  teableRecordId: string;
  remoteVersion: number;
  localVersion: number;
  contentHash: string;
}

export interface ISyncDiffSummary {
  total: number;
  synced: number;
  remoteOnly: number;
  localOnly: number;
  conflicts: number;
}

export const SUPPORTED_SYNC_DIRECTIONS: ReadonlyArray<SyncDirection> = [
  'one-way-push',
  'one-way-pull',
  'bi-directional',
];
