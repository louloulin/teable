/**
 * Google Sheets bi-directional sync — Stage 37 types.
 *
 * Sheets Connection + Sheet Mapping + per-row SyncRecord
 * + per-run SyncLog. Webhook channel subscriptions use
 * Google Sheets API's `spreadsheets.watch` (channel + expiration).
 */

export type SheetsSyncDirection = 'one-way-push' | 'one-way-pull' | 'bi-directional';

export type SheetsMappingStatus = 'ready' | 'paused' | 'error';

export type SheetsSyncRecordState = 'synced' | 'remote-only' | 'local-only' | 'conflict';

export type SheetsRunDirection = 'push' | 'pull' | 'conflict-resolved';

export type SheetsRunStatus = 'ok' | 'failed' | 'partial';

export interface ISheetsFieldMap {
  /** Sheets header (column A, B, ...) → Teable fieldId. */
  [sheetHeader: string]: string;
}

export interface IGoogleSheetsConnection {
  id: string;
  organizationId: string;
  baseId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  /// OAuth refresh token (server-side) — stored SHA-256 hashed.
  refreshTokenHash: string;
  /// Service-account email, when used instead of OAuth.
  serviceAccountEmail: string | null;
  connectedBy: string;
  connectedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}

export interface IGoogleSheetsMapping {
  id: string;
  connectionId: string;
  sheetId: string;
  sheetTitle: string;
  /// Index sheet tab (sheetId) inside the spreadsheet.
  sheetGid: number;
  teableBaseId: string;
  teableTableId: string;
  direction: SheetsSyncDirection;
  status: SheetsMappingStatus;
  /// Row index of the header row (default 1).
  headerRow: number;
  fieldMapJson: string;
  fieldMapHash: string;
  lastSyncedTime: Date | null;
  lastErrorMessage: string | null;
  createdTime: Date;
}

export interface IGoogleSheetsSyncRecord {
  id: string;
  mappingId: string;
  /// Teable recordId (or null for remote-only).
  recordId: string | null;
  /// Sheets row number (1-based) used as the source-of-truth key.
  sheetsRowNumber: number | null;
  state: SheetsSyncRecordState;
  localUpdatedAt: Date | null;
  remoteUpdatedAt: Date | null;
  lastSyncedAt: Date | null;
}

export interface IGoogleSheetsSyncLog {
  id: string;
  mappingId: string;
  direction: SheetsRunDirection;
  status: SheetsRunStatus;
  rowsRead: number;
  rowsWritten: number;
  conflictsResolved: number;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
}

export interface IGoogleSheetsWebhookChannel {
  id: String; // Excel-style id (UUID-ish)
  resourceId: string;
  /// Milliseconds since epoch when Google will expire the channel.
  expiration: number;
  mappingId: string;
  connectionId: string;
}

export interface ICreateConnectionInput {
  organizationId: string;
  baseId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  refreshToken: string;
  serviceAccountEmail?: string | null;
  connectedBy: string;
}

export interface ICreateMappingInput {
  connectionId: string;
  sheetId: string;
  sheetTitle: string;
  sheetGid: number;
  teableBaseId: string;
  teableTableId: string;
  direction: SheetsSyncDirection;
  fieldMap: ISheetsFieldMap;
  headerRow?: number;
}

export interface IRecordSyncStateInput {
  recordId: string | null;
  sheetsRowNumber: number | null;
  state: SheetsSyncRecordState;
}
