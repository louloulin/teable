/**
 * Cross-base federation — pure helpers (Stage 74).
 */

import type {
  FederationRefreshMode,
  FederationSourceKind,
  FederationStatus,
  ICrossBaseFederationOptions,
  IFederationEvent,
  IFederationRefresh,
  IFederationSource,
  IFederationView,
} from './cross-base-federation.types';
import {
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  FEDERATION_REFRESH_MODES,
  FEDERATION_SOURCE_KINDS,
  FEDERATION_STATUSES,
  MAX_EVENTS_PER_REFRESH,
  MAX_FIELDS_PER_SOURCE,
  MAX_REFRESH_INTERVAL_SECONDS,
  MAX_SOURCES_PER_VIEW,
  MIN_REFRESH_INTERVAL_SECONDS,
} from './cross-base-federation.types';

/** Whether the input is a recognized federation status. */
export function isFederationStatus(s: string): s is FederationStatus {
  return (FEDERATION_STATUSES as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized source kind. */
export function isFederationSourceKind(s: string): s is FederationSourceKind {
  return (FEDERATION_SOURCE_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized refresh mode. */
export function isFederationRefreshMode(s: string): s is FederationRefreshMode {
  return (FEDERATION_REFRESH_MODES as ReadonlyArray<string>).includes(s);
}

/** Default refresh interval. */
export function defaultRefreshIntervalSeconds(opts?: ICrossBaseFederationOptions): number {
  return opts?.defaultRefreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
}

/** Max sources per view. */
export function maxSourcesPerView(): number {
  return MAX_SOURCES_PER_VIEW;
}

/** Validate a federation view. */
export function validateView(v: IFederationView): string | null {
  if (!v.id) return 'id required';
  if (!v.orgId) return 'orgId required';
  if (!v.name) return 'name required';
  if (!isFederationStatus(v.status)) return `unknown status: ${v.status}`;
  if (!isFederationRefreshMode(v.refreshMode)) return `unknown refreshMode: ${v.refreshMode}`;
  if (
    v.refreshIntervalSeconds < MIN_REFRESH_INTERVAL_SECONDS ||
    v.refreshIntervalSeconds > MAX_REFRESH_INTERVAL_SECONDS
  ) {
    return `refreshIntervalSeconds must be ${MIN_REFRESH_INTERVAL_SECONDS}..${MAX_REFRESH_INTERVAL_SECONDS}`;
  }
  return null;
}

/** Normalize a view. */
export function normalizeView(input: {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  status?: FederationStatus;
  refreshMode?: FederationRefreshMode;
  refreshIntervalSeconds?: number;
  now?: string;
}): IFederationView {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    orgId: input.orgId,
    name: input.name,
    description: input.description ?? '',
    status: input.status ?? 'draft',
    refreshMode: input.refreshMode ?? 'event',
    refreshIntervalSeconds: clamp(
      input.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS,
      MIN_REFRESH_INTERVAL_SECONDS,
      MAX_REFRESH_INTERVAL_SECONDS
    ),
    lastRefreshedBy: null,
    lastRefreshedAt: null,
    lastStalenessSeconds: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Validate a source. */
export function validateSource(s: IFederationSource, viewId: string): string | null {
  if (!s.id) return 'id required';
  if (s.id === viewId) return 'source id must differ from view id';
  if (!s.baseId) return 'baseId required';
  if (!isFederationSourceKind(s.kind)) return `unknown kind: ${s.kind}`;
  if (!s.targetId) return 'targetId required';
  if (!s.alias) return 'alias required';
  if (s.fields !== null && s.fields.length > MAX_FIELDS_PER_SOURCE) {
    return `fields length must be ≤ ${MAX_FIELDS_PER_SOURCE}`;
  }
  return null;
}

/** Normalize a source. */
export function normalizeSource(input: {
  id: string;
  baseId: string;
  kind: FederationSourceKind;
  targetId: string;
  alias: string;
  fields?: string[] | null;
  filter?: string | null;
}): IFederationSource {
  return {
    id: input.id,
    baseId: input.baseId,
    kind: input.kind,
    targetId: input.targetId,
    alias: input.alias,
    fields: input.fields ?? null,
    filter: input.filter ?? null,
  };
}

/** Resolve the next refresh ETA. */
export function nextRefreshAt(input: { view: IFederationView; now?: string }): string | null {
  if (input.view.refreshMode !== 'interval') return null;
  const baseIso = input.view.lastRefreshedAt ?? input.now ?? new Date().toISOString();
  const ms = new Date(baseIso).getTime() + input.view.refreshIntervalSeconds * 1_000;
  return new Date(ms).toISOString();
}

/** Decide staleness seconds given the last refresh and now. */
export function stalenessSeconds(input: { view: IFederationView; now?: string }): number | null {
  if (!input.view.lastRefreshedAt) return null;
  const nowMs = new Date(input.now ?? new Date().toISOString()).getTime();
  const lastMs = new Date(input.view.lastRefreshedAt).getTime();
  return Math.max(0, Math.floor((nowMs - lastMs) / 1_000));
}

/** Determine whether a refresh should fire now. */
export function shouldRefreshNow(input: {
  view: IFederationView;
  pendingEvents: IFederationEvent[];
  now?: string;
}): boolean {
  if (input.view.status !== 'active') return false;
  if (input.view.refreshMode === 'manual') return false;
  if (input.view.refreshMode === 'event') return input.pendingEvents.length > 0;
  const eta = nextRefreshAt({ view: input.view, ...(input.now ? { now: input.now } : {}) });
  if (!eta) return false;
  return new Date(eta).getTime() <= new Date(input.now ?? new Date().toISOString()).getTime();
}

/** Start a refresh job. */
export function startRefresh(input: {
  id: string;
  viewId: string;
  now?: string;
}): IFederationRefresh {
  return {
    id: input.id,
    viewId: input.viewId,
    status: 'running',
    startedAt: input.now ?? new Date().toISOString(),
    finishedAt: null,
    eventsConsumed: 0,
    rowsWritten: 0,
    durationMs: null,
    lastError: null,
  };
}

/** Finish a refresh job. */
export function finishRefresh(input: {
  job: IFederationRefresh;
  status: 'done' | 'failed';
  eventsConsumed: number;
  rowsWritten: number;
  error?: string | null;
  now?: string;
}): IFederationRefresh {
  const nowIso = input.now ?? new Date().toISOString();
  const startedAtMs = input.job.startedAt ? new Date(input.job.startedAt).getTime() : Date.now();
  return {
    ...input.job,
    status: input.status,
    finishedAt: nowIso,
    eventsConsumed: input.eventsConsumed,
    rowsWritten: input.rowsWritten,
    durationMs: Math.max(0, new Date(nowIso).getTime() - startedAtMs),
    lastError: input.error ?? null,
  };
}

/** Mark events consumed by a refresh. */
export function consumeEvents(input: {
  events: IFederationEvent[];
  now?: string;
}): IFederationEvent[] {
  void input.now;
  return input.events.slice(0, MAX_EVENTS_PER_REFRESH).map((e) => ({ ...e, processed: true }));
}

/** Compute the alias mapping for a list of sources. */
export function aliasMap(sources: IFederationSource[]): Record<string, IFederationSource> {
  const out: Record<string, IFederationSource> = {};
  for (const s of sources) {
    if (!out[s.alias]) out[s.alias] = s;
  }
  return out;
}

/** Whether the view has any sources. */
export function hasSources(input: { sources: IFederationSource[]; viewId: string }): boolean {
  return input.sources.length > 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
