/**
 * Google Sheets sync — Stage 37.
 *
 * Pure helpers: refresh-token SHA-256 hashing, deterministic
 * fieldMap hashing, Sheets cell-value parser (handles date serial
 * numbers + leading single-quote escape), allowed-mutations
 * direction table, conflict resolution policy, and a webhook
 * channel helper for spreadsheets.watch.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  ICreateMappingInput,
  IGoogleSheetsMapping,
  IGoogleSheetsSyncRecord,
  IGoogleSheetsWebhookChannel,
  IRecordSyncStateInput,
  ISheetsFieldMap,
  SheetsMappingStatus,
  SheetsRunStatus,
  SheetsSyncDirection,
  SheetsSyncRecordState,
} from './google-sheets-sync.types';

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function stringifyFieldMap(m: ISheetsFieldMap): string {
  const sorted = Object.keys(m)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = m[k]!;
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export function hashFieldMap(m: ISheetsFieldMap): string {
  return createHash('sha256').update(stringifyFieldMap(m)).digest('hex');
}

export function isValidDirection(d: string): d is SheetsSyncDirection {
  return d === 'one-way-push' || d === 'one-way-pull' || d === 'bi-directional';
}

export function isValidStatusTransition(
  from: SheetsMappingStatus,
  to: SheetsMappingStatus
): boolean {
  const allow: Record<SheetsMappingStatus, ReadonlyArray<SheetsMappingStatus>> = {
    ready: ['paused', 'error'],
    paused: ['ready', 'error'],
    error: ['ready', 'paused'],
  };
  return allow[from]?.includes(to) ?? false;
}

export interface IMutations {
  canPushLocalToRemote: boolean;
  canPullRemoteToLocal: boolean;
  canCreate: boolean;
  canDeleteRemote: boolean;
}

/** Direction → allowed mutations table. Pull-only never pushes to Sheets. */
export function deriveAllowedMutations(direction: SheetsSyncDirection): IMutations {
  switch (direction) {
    case 'one-way-push':
      return {
        canPushLocalToRemote: true,
        canPullRemoteToLocal: false,
        canCreate: true,
        canDeleteRemote: true,
      };
    case 'one-way-pull':
      return {
        canPushLocalToRemote: false,
        canPullRemoteToLocal: true,
        canCreate: true,
        canDeleteRemote: false,
      };
    case 'bi-directional':
      return {
        canPushLocalToRemote: true,
        canPullRemoteToLocal: true,
        canCreate: true,
        canDeleteRemote: true,
      };
  }
}

/**
 * Resolve a conflict. The latest write wins; ties go to local.
 * State advances to `synced` when a winner is chosen; if both
 * sides are equally fresh we record a `conflict` for review.
 */
export function resolveConflict(input: {
  localUpdatedAt: Date | null;
  remoteUpdatedAt: Date | null;
}): { winner: 'remote' | 'local' | 'tie'; nextState: SheetsSyncRecordState } {
  const l = input.localUpdatedAt?.getTime() ?? 0;
  const r = input.remoteUpdatedAt?.getTime() ?? 0;
  if (l === 0 && r === 0) return { winner: 'tie', nextState: 'conflict' };
  if (l === r) return { winner: 'local', nextState: 'synced' };
  if (l > r) return { winner: 'local', nextState: 'synced' };
  return { winner: 'remote', nextState: 'synced' };
}

/** Google Sheets uses 1900-based epoch for date serial numbers. */
export function parseCellValue(raw: string): string | number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  // Leading single-quote escape for forced-text cells.
  if (raw.startsWith("'")) return raw.slice(1);
  // Date serial (whole number) → ISO date.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 25569 && n < 80000) {
      const ms = (n - 25569) * 86_400_000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return n;
  }
  return raw;
}

export function buildMappingRow(input: ICreateMappingInput & { id: string }): IGoogleSheetsMapping {
  return {
    id: input.id,
    connectionId: input.connectionId,
    sheetId: input.sheetId,
    sheetTitle: input.sheetTitle,
    sheetGid: input.sheetGid,
    teableBaseId: input.teableBaseId,
    teableTableId: input.teableTableId,
    direction: input.direction,
    status: 'ready',
    headerRow: input.headerRow ?? 1,
    fieldMapJson: stringifyFieldMap(input.fieldMap),
    fieldMapHash: hashFieldMap(input.fieldMap),
    lastSyncedTime: null,
    lastErrorMessage: null,
    createdTime: new Date(),
  };
}

export function buildSyncRecordRow(input: {
  id: string;
  mappingId: string;
  record: IRecordSyncStateInput;
  now: Date;
}): IGoogleSheetsSyncRecord {
  return {
    id: input.id,
    mappingId: input.mappingId,
    recordId: input.record.recordId,
    sheetsRowNumber: input.record.sheetsRowNumber,
    state: input.record.state,
    localUpdatedAt: null,
    remoteUpdatedAt: null,
    lastSyncedAt: input.now,
  };
}

/** Generate a Google-style channel id: `gsheets-<24 hex>`. */
export function generateChannelId(): string {
  return `gsheets-${randomBytes(12).toString('hex')}`;
}

export function buildChannelRow(input: {
  resourceId: string;
  expiration: number;
  mappingId: string;
  connectionId: string;
}): IGoogleSheetsWebhookChannel {
  return {
    id: generateChannelId() as unknown as String, // typed loosely in interface
    resourceId: input.resourceId,
    expiration: input.expiration,
    mappingId: input.mappingId,
    connectionId: input.connectionId,
  };
}

export interface IRunSummary {
  total: number;
  pushed: number;
  pulled: number;
  conflicts: number;
  status: SheetsRunStatus;
}

export function foldRun(input: {
  records: ReadonlyArray<{ state: SheetsSyncRecordState }>;
  hadFailure: boolean;
}): IRunSummary {
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;
  for (const r of input.records) {
    if (r.state === 'local-only') pushed++;
    else if (r.state === 'remote-only') pulled++;
    else if (r.state === 'conflict') conflicts++;
  }
  const status: SheetsRunStatus = input.hadFailure
    ? conflicts > 0 || pushed + pulled > 0
      ? 'partial'
      : 'failed'
    : 'ok';
  return { total: input.records.length, pushed, pulled, conflicts, status };
}

export const DEFAULT_HEADER_ROW = 1;
