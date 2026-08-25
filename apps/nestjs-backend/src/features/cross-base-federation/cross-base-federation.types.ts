/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Cross-base federation — Stage 74.
 *
 * Enterprise feature: a single read-only "federation view" that joins
 * data from multiple bases across the org. Each source is a table-like
 * pointer to a (baseId, tableId, viewId) triple, with optional column
 * renames + a JSON merge expression. The federation view rebuilds when
 * any source publishes a change event; staleness is bounded by the
 * minimum refresh interval.
 */

export type FederationStatus = 'active' | 'paused' | 'broken' | 'draft';
export type FederationSourceKind = 'table' | 'view';
export type FederationRefreshMode = 'event' | 'interval' | 'manual';

export interface IFederationSource {
  id: string;
  baseId: string;
  /// "table" or "view".
  kind: FederationSourceKind;
  /// tableId when kind=table, viewId when kind=view.
  targetId: string;
  /** Optional alias for the source within the federation. */
  alias: string;
  /** Field projection (column names) — null = all fields. */
  fields: string[] | null;
  /** Optional static filter expression. */
  filter: string | null;
}

export interface IFederationView {
  id: string;
  orgId: string;
  name: string;
  description: string;
  status: FederationStatus;
  /** How the view refreshes. */
  refreshMode: FederationRefreshMode;
  /** When refreshMode=interval, seconds between rebuilds. */
  refreshIntervalSeconds: number;
  /** Optional user id who last refreshed. */
  lastRefreshedBy: string | null;
  lastRefreshedAt: string | null;
  /** Estimated staleness in seconds; recomputed on every refresh. */
  lastStalenessSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface IFederationEvent {
  id: string;
  viewId: string;
  sourceId: string;
  /** "row.created" | "row.updated" | "row.deleted" | "schema.changed" */
  kind: string;
  occurredAt: string;
  /** Compact summary of what changed (e.g. row count delta). */
  summary: string;
  processed: boolean;
}

export interface IFederationRefresh {
  id: string;
  viewId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  eventsConsumed: number;
  rowsWritten: number;
  durationMs: number | null;
  lastError: string | null;
}

export interface ICrossBaseFederationOptions {
  /// Override "now".
  now?: string;
  /// Default refresh interval (seconds) when not set on the view.
  defaultRefreshIntervalSeconds?: number;
}

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
export const MIN_REFRESH_INTERVAL_SECONDS = 5;
export const MAX_REFRESH_INTERVAL_SECONDS = 86_400;
export const MAX_SOURCES_PER_VIEW = 32;
export const MAX_FIELDS_PER_SOURCE = 256;
export const MAX_EVENTS_PER_REFRESH = 10_000;

export const FEDERATION_STATUSES: ReadonlyArray<FederationStatus> = [
  'active',
  'paused',
  'broken',
  'draft',
];
export const FEDERATION_SOURCE_KINDS: ReadonlyArray<FederationSourceKind> = ['table', 'view'];
export const FEDERATION_REFRESH_MODES: ReadonlyArray<FederationRefreshMode> = [
  'event',
  'interval',
  'manual',
];

export const FEDERATION_STATUS_LABELS: Record<FederationStatus, string> = {
  active: '生效中',
  paused: '已暂停',
  broken: '异常',
  draft: '草稿',
};
