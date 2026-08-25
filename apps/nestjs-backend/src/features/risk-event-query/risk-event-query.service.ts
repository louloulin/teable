/**
 * Risk event query DSL — pure helpers (Stage 79).
 */

import type {
  IRiskEventCursor,
  IRiskEventFilter,
  IRiskEventQuery,
  IRiskEventRow,
  RiskBandKind,
  RiskDecisionKind,
  RiskEventKind,
  RiskOrdering,
} from './risk-event-query.types';
import {
  RISK_BAND_KINDS,
  RISK_DECISION_KINDS,
  RISK_DEFAULT_LIMIT,
  RISK_EVENT_KINDS,
  RISK_MAX_ACTORS_PER_QUERY,
  RISK_MAX_LIMIT,
  RISK_MAX_ORGS_PER_QUERY,
  RISK_MAX_TERM_LENGTH,
} from './risk-event-query.types';

/** Whether the decision is canonical. */
export function isRiskDecision(s: string): s is RiskDecisionKind {
  return (RISK_DECISION_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the band is canonical. */
export function isRiskBand(s: string): s is RiskBandKind {
  return (RISK_BAND_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the event kind is canonical. */
export function isRiskEventKind(s: string): s is RiskEventKind {
  return (RISK_EVENT_KINDS as ReadonlyArray<string>).includes(s);
}

/** Validate a filter and normalize it. */
export function validateFilter(filter: IRiskEventFilter): string | null {
  const sizeErr = validateIdLists(filter);
  if (sizeErr) return sizeErr;
  const kindErr = validateKinds(filter);
  if (kindErr) return kindErr;
  const rangeErr = validateRange(filter);
  if (rangeErr) return rangeErr;
  const limitErr = validateLimit(filter.limit);
  if (limitErr) return limitErr;
  return null;
}

function validateIdLists(filter: IRiskEventFilter): string | null {
  if (filter.orgIds && filter.orgIds.length > RISK_MAX_ORGS_PER_QUERY) {
    return `orgIds > ${RISK_MAX_ORGS_PER_QUERY}`;
  }
  if (filter.actorIds && filter.actorIds.length > RISK_MAX_ACTORS_PER_QUERY) {
    return `actorIds > ${RISK_MAX_ACTORS_PER_QUERY}`;
  }
  return null;
}

function validateKinds(filter: IRiskEventFilter): string | null {
  if (filter.decisions && filter.decisions.some((d) => !isRiskDecision(d))) {
    return 'unknown decision';
  }
  if (filter.bands && filter.bands.some((b) => !isRiskBand(b))) {
    return 'unknown band';
  }
  if (filter.kinds && filter.kinds.some((k) => !isRiskEventKind(k))) {
    return 'unknown kind';
  }
  return null;
}

function validateRange(filter: IRiskEventFilter): string | null {
  if (filter.from && filter.to && filter.from >= filter.to) {
    return 'from >= to';
  }
  if (filter.text && filter.text.length > RISK_MAX_TERM_LENGTH) {
    return `text > ${RISK_MAX_TERM_LENGTH}`;
  }
  return null;
}

function validateLimit(limit: number | undefined): string | null {
  if (limit === undefined) return null;
  if (limit < 1 || limit > RISK_MAX_LIMIT) return `limit out of range`;
  return null;
}

/** Normalize a filter (defaults applied). */
export function normalizeFilter(filter: IRiskEventFilter): IRiskEventFilter {
  return {
    ...filter,
    limit: filter.limit ?? RISK_DEFAULT_LIMIT,
    order: filter.order ?? 'desc',
  };
}

/** Build a query from raw input. */
export function buildQuery(input: { filter: IRiskEventFilter }): IRiskEventQuery {
  const err = validateFilter(input.filter);
  if (err) throw new Error(`invalid risk filter: ${err}`);
  return { filter: normalizeFilter(input.filter) };
}

/** Compile a filter to a Prisma `where` predicate. */
export function toWhere(filter: IRiskEventFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  setInClause(where, 'orgId', filter.orgIds);
  setInClause(where, 'actorId', filter.actorIds);
  setInClause(where, 'decision', filter.decisions);
  setInClause(where, 'band', filter.bands);
  setInClause(where, 'kind', filter.kinds);
  if (filter.from || filter.to) {
    where['occurredAt'] = timeRange(filter.from, filter.to);
  }
  if (filter.text) {
    where['detail'] = { contains: filter.text, mode: 'insensitive' };
  }
  return where;
}

/** Add an `in` clause when the list is non-empty. */
function setInClause(
  where: Record<string, unknown>,
  key: string,
  list: ReadonlyArray<string> | undefined
): void {
  if (list && list.length > 0) where[key] = { in: list };
}

/** Build a time range with optional gte/lt. */
function timeRange(from: string | undefined, to: string | undefined): Record<string, string> {
  const range: Record<string, string> = {};
  if (from) range['gte'] = from;
  if (to) range['lt'] = to;
  return range;
}

/** Compile cursor predicate for keyset pagination. */
export function cursorWhere(input: {
  filter: IRiskEventFilter;
  cursor: IRiskEventCursor;
}): Record<string, unknown> {
  const order: RiskOrdering = input.filter.order ?? 'desc';
  if (order === 'desc') {
    return {
      OR: [
        { occurredAt: { lt: input.cursor.key } },
        { occurredAt: input.cursor.key, id: { lt: input.cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { occurredAt: { gt: input.cursor.key } },
      { occurredAt: input.cursor.key, id: { gt: input.cursor.id } },
    ],
  };
}

/** Build an orderBy. */
export function orderBy(filter: IRiskEventFilter): Array<Record<string, 'asc' | 'desc'>> {
  const order = filter.order ?? 'desc';
  return [{ occurredAt: order }, { id: order }];
}

/** Compute the next cursor given the last row in a page. */
export function nextCursor(input: { last: IRiskEventRow | null }): IRiskEventCursor | null {
  if (!input.last) return null;
  return { key: input.last.occurredAt, id: input.last.id };
}

/** Filter an in-memory list (used in tests and offline mode). */
export function matchRow(input: { row: IRiskEventRow; filter: IRiskEventFilter }): boolean {
  const f = input.filter;
  const r = input.row;
  return (
    arrayIncludes(f.orgIds, r.orgId) &&
    arrayIncludes(f.actorIds, r.actorId) &&
    arrayIncludes(f.kinds, r.kind) &&
    nullableFieldMatch(f.decisions, r.decision) &&
    nullableFieldMatch(f.bands, r.band) &&
    (!f.from || r.occurredAt >= f.from) &&
    (!f.to || r.occurredAt < f.to) &&
    (!f.text || r.detail.toLowerCase().includes(f.text.toLowerCase()))
  );
}

/** True when the array is empty or contains the value. */
function arrayIncludes(arr: ReadonlyArray<string> | undefined, v: string): boolean {
  if (!arr || arr.length === 0) return true;
  return arr.includes(v);
}

/** True when the filter list is empty or the nullable field matches. */
function nullableFieldMatch<T extends string>(
  arr: ReadonlyArray<T> | undefined,
  v: T | null
): boolean {
  if (!arr || arr.length === 0) return true;
  return v !== null && arr.includes(v);
}

/** Sort and paginate an in-memory list. */
export function paginate(input: { rows: IRiskEventRow[]; filter: IRiskEventFilter }): {
  rows: IRiskEventRow[];
  nextCursor: IRiskEventCursor | null;
} {
  const order = input.filter.order ?? 'desc';
  const limit = input.filter.limit ?? RISK_DEFAULT_LIMIT;
  const filtered = input.rows.filter((r) => matchRow({ row: r, filter: input.filter }));
  filtered.sort((a, b) => {
    const cmp = a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0;
    if (cmp !== 0) return order === 'asc' ? cmp : -cmp;
    const idCmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return order === 'asc' ? idCmp : -idCmp;
  });
  let startIdx = 0;
  if (input.filter.cursor) {
    const c = input.filter.cursor;
    startIdx = filtered.findIndex(
      (r) => (r.occurredAt > c.key || (r.occurredAt === c.key && r.id > c.id)) === (order === 'asc')
    );
    if (startIdx < 0) startIdx = filtered.length;
  }
  const page = filtered.slice(startIdx, startIdx + limit);
  return { rows: page, nextCursor: nextCursor({ last: page[page.length - 1] ?? null }) };
}
