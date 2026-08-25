/**
 * Airtable bi-directional sync — Stage 36.
 *
 * Pure helpers: field map hashing, mapping row construction,
 * per-record conflict resolution, sync diff aggregation, and
 * direction-aware mutation rule derivation.
 */

import { createHash } from 'node:crypto';

import type {
  IAirtableFieldMap,
  IAirtableSyncRecord,
  ICreateMappingInput,
  ISyncCandidate,
  ISyncDiffSummary,
  IUpdateMappingInput,
  MappingStatus,
  SyncDirection,
  SyncRecordState,
} from './airtable-sync.types';
import { SUPPORTED_SYNC_DIRECTIONS } from './airtable-sync.types';

export function hashFieldMap(fieldMap: IAirtableFieldMap): string {
  const ordered: Array<[string, string]> = Object.entries(fieldMap).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export function parseFieldMap(fieldMapJson: string): IAirtableFieldMap {
  const parsed = JSON.parse(fieldMapJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('fieldMapJson must be an object');
  }
  const result: IAirtableFieldMap = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') throw new Error(`fieldMap.${k} must be a string`);
    result[k] = v;
  }
  return result;
}

export function stringifyFieldMap(fieldMap: IAirtableFieldMap): string {
  const ordered: Array<[string, string]> = Object.entries(fieldMap).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return JSON.stringify(Object.fromEntries(ordered));
}

export function isValidDirection(d: string): d is SyncDirection {
  return (SUPPORTED_SYNC_DIRECTIONS as ReadonlyArray<string>).includes(d);
}

export function isValidStatusTransition(from: MappingStatus, to: MappingStatus): boolean {
  const allow: Record<MappingStatus, ReadonlyArray<MappingStatus>> = {
    ready: ['paused', 'error'],
    paused: ['ready', 'error'],
    error: ['ready', 'paused'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function buildMappingRow(input: ICreateMappingInput & { id: string; now?: Date }): {
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
} {
  const fieldMapJson = stringifyFieldMap(input.fieldMap);
  const fieldMapHash = hashFieldMap(input.fieldMap);
  const now = input.now ?? new Date();
  return {
    id: input.id,
    connectionId: input.connectionId,
    airtableTableId: input.airtableTableId,
    airtableTableName: input.airtableTableName,
    teableBaseId: input.teableBaseId,
    teableTableId: input.teableTableId,
    direction: input.direction ?? 'bi-directional',
    status: 'ready',
    fieldMapJson,
    fieldMapHash,
    lastSyncedTime: null,
    lastErrorMessage: null,
    createdTime: now,
    updatedTime: now,
  };
}

export function applyMappingUpdate(
  row: {
    direction: SyncDirection;
    status: MappingStatus;
    fieldMapJson: string;
    fieldMapHash: string;
    lastErrorMessage: string | null;
  },
  update: IUpdateMappingInput
): typeof row & { updatedTime: Date; fieldMapJson: string; fieldMapHash: string } {
  let fieldMapJson = row.fieldMapJson;
  let fieldMapHash = row.fieldMapHash;
  if (update.fieldMap) {
    fieldMapJson = stringifyFieldMap(update.fieldMap);
    fieldMapHash = hashFieldMap(update.fieldMap);
  }
  return {
    ...row,
    direction: update.direction ?? row.direction,
    status: update.status ?? row.status,
    fieldMapJson,
    fieldMapHash,
    lastErrorMessage:
      update.lastErrorMessage !== undefined ? update.lastErrorMessage : row.lastErrorMessage,
    updatedTime: new Date(),
  };
}

/** Resolve a conflict by version comparison — higher version wins, ties → "conflict". */
export function resolveConflict(c: ISyncCandidate): {
  winner: 'remote' | 'local' | 'tie';
  nextState: SyncRecordState;
} {
  if (c.remoteVersion > c.localVersion) return { winner: 'remote', nextState: 'synced' };
  if (c.localVersion > c.remoteVersion) return { winner: 'local', nextState: 'synced' };
  return { winner: 'tie', nextState: 'conflict' };
}

/** Decide what mutations are allowed for the configured sync direction. */
export function deriveAllowedMutations(input: { direction: SyncDirection }): {
  canPushLocalToRemote: boolean;
  canPullRemoteToLocal: boolean;
  canCreate: boolean;
  canDeleteRemote: boolean;
} {
  switch (input.direction) {
    case 'one-way-push':
      return {
        canPushLocalToRemote: true,
        canPullRemoteToLocal: false,
        canCreate: true,
        canDeleteRemote: false,
      };
    case 'one-way-pull':
      return {
        canPushLocalToRemote: false,
        canPullRemoteToLocal: true,
        canCreate: false,
        canDeleteRemote: true,
      };
    case 'bi-directional':
    default:
      return {
        canPushLocalToRemote: true,
        canPullRemoteToLocal: true,
        canCreate: true,
        canDeleteRemote: true,
      };
  }
}

export function foldSyncRecords(records: ReadonlyArray<IAirtableSyncRecord>): ISyncDiffSummary {
  const summary: ISyncDiffSummary = {
    total: records.length,
    synced: 0,
    remoteOnly: 0,
    localOnly: 0,
    conflicts: 0,
  };
  for (const r of records) {
    if (r.state === 'synced') summary.synced += 1;
    else if (r.state === 'remote-only') summary.remoteOnly += 1;
    else if (r.state === 'local-only') summary.localOnly += 1;
    else if (r.state === 'conflict') summary.conflicts += 1;
  }
  return summary;
}

/** Detect whether two maps have diverged (different hash). */
export function isFieldMapStale(input: {
  currentHash: string;
  incomingMap: IAirtableFieldMap;
}): boolean {
  return hashFieldMap(input.incomingMap) !== input.currentHash;
}

/** Build a deterministic sync record id from mapping + airtable + teable ids. */
export function buildSyncRecordId(input: {
  mappingId: string;
  airtableRecordId: string;
  teableRecordId: string;
}): string {
  return createHash('sha256')
    .update(`${input.mappingId}|${input.airtableRecordId}|${input.teableRecordId}`)
    .digest('hex')
    .slice(0, 24);
}
