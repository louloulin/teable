/**
 * Dashboard widget market — Stage 55.
 *
 * Pure helpers: validation, registry lookups, aggregation primitives,
 * renderer dispatch. The auth layer is responsible for fetching raw
 * rows from Prisma; this service consumes them.
 */

import type {
  AggregationFn,
  IWidgetDataBinding,
  IWidgetInstance,
  IWidgetRenderResult,
  IWidgetSeriesPoint,
  WidgetKind,
} from './widget-market.types';
import {
  DEFAULT_WIDGET_HEIGHT,
  DEFAULT_WIDGET_WIDTH,
  MAX_WIDGET_INSTANCES_PER_DASHBOARD,
  findWidgetDefinition,
} from './widget-market.types';

export interface IRowLike {
  cells: Record<string, unknown>;
}

export function isWidgetKind(value: unknown): value is WidgetKind {
  return (
    value === 'line' ||
    value === 'bar' ||
    value === 'pie' ||
    value === 'kpi' ||
    value === 'counter' ||
    value === 'pivot' ||
    value === 'table'
  );
}

export function isAggregationFn(value: unknown): value is AggregationFn {
  return (
    value === 'sum' ||
    value === 'avg' ||
    value === 'min' ||
    value === 'max' ||
    value === 'count' ||
    value === 'countDistinct'
  );
}

export function newWidgetInstanceId(): string {
  return `wgt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Validate a widget instance; throws on errors. Returns null when valid. */
export function validateWidgetInstance(
  instance: IWidgetInstance,
  existingCount: number
): string | null {
  if (!isWidgetKind(instance.definition))
    return `unsupported widget kind: ${String(instance.definition)}`;
  const def = findWidgetDefinition(instance.definition);
  if (!def) return `unknown widget kind: ${instance.definition}`;
  if (!instance.binding.tableId) return 'binding.tableId required';
  if (!instance.binding.dimensionFieldId) return 'binding.dimensionFieldId required';
  if (def.requiresMetric && !instance.binding.metricFieldId) {
    return `widget ${instance.definition} requires a metricFieldId`;
  }
  const agg = instance.binding.aggregation ?? 'count';
  if (!isAggregationFn(agg)) return `unsupported aggregation: ${String(agg)}`;
  if (!def.allowedAggregations.includes(agg)) {
    return `aggregation ${agg} not allowed for widget kind ${instance.definition}`;
  }
  if (existingCount >= MAX_WIDGET_INSTANCES_PER_DASHBOARD) {
    return `too many widget instances (max ${MAX_WIDGET_INSTANCES_PER_DASHBOARD})`;
  }
  const pos = instance.position;
  if (pos.w <= 0 || pos.h <= 0) return 'position.w and position.h must be > 0';
  if (pos.x < 0 || pos.y < 0) return 'position.x and position.y must be >= 0';
  return null;
}

export function defaultPosition(idx: number): { x: number; y: number; w: number; h: number } {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  return {
    x: col * DEFAULT_WIDGET_WIDTH,
    y: row * DEFAULT_WIDGET_HEIGHT,
    w: DEFAULT_WIDGET_WIDTH,
    h: DEFAULT_WIDGET_HEIGHT,
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function asKey(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Group rows by dimensionFieldId, apply aggregation to metricFieldId. */
export function aggregate(
  rows: ReadonlyArray<IRowLike>,
  binding: IWidgetDataBinding
): IWidgetSeriesPoint[] {
  const agg = binding.aggregation ?? 'count';
  const needsMetric = agg !== 'count' && agg !== 'countDistinct';
  const buckets = new Map<string, IAggregateBucket>();

  for (const row of rows) {
    accumulateBucket(buckets, row, binding, needsMetric);
  }

  return [...buckets.entries()]
    .map(([dimension, e]) => ({ dimension, metric: projectBucket(e, agg, needsMetric) }))
    .sort((a, b) => (a.dimension > b.dimension ? 1 : a.dimension < b.dimension ? -1 : 0));
}

interface IAggregateBucket {
  sum: number;
  count: number;
  distinct: Set<string>;
  min: number;
  max: number;
}

function emptyBucket(): IAggregateBucket {
  return { sum: 0, count: 0, distinct: new Set(), min: Infinity, max: -Infinity };
}

function accumulateBucket(
  buckets: Map<string, IAggregateBucket>,
  row: IRowLike,
  binding: IWidgetDataBinding,
  needsMetric: boolean
): void {
  const dim = asKey(row.cells[binding.dimensionFieldId]);
  const entry = buckets.get(dim) ?? emptyBucket();
  entry.count += 1;
  if (needsMetric) {
    const metricKey = binding.metricFieldId ?? '';
    const m = asNumber(row.cells[metricKey]);
    if (m !== null) {
      entry.sum += m;
      if (m < entry.min) entry.min = m;
      if (m > entry.max) entry.max = m;
    }
    entry.distinct.add(asKey(row.cells[metricKey]));
  } else {
    entry.distinct.add(asKey(row.cells[binding.dimensionFieldId]));
  }
  buckets.set(dim, entry);
}

function projectBucket(e: IAggregateBucket, agg: AggregationFn, needsMetric: boolean): number {
  switch (agg) {
    case 'sum':
      return e.sum;
    case 'avg':
      return e.count > 0 && needsMetric ? e.sum / e.count : 0;
    case 'min':
      return e.min === Infinity ? 0 : e.min;
    case 'max':
      return e.max === -Infinity ? 0 : e.max;
    case 'count':
      return e.count;
    case 'countDistinct':
      return e.distinct.size;
    default:
      return 0;
  }
}

/** Pivot: group by (rowField, colField), aggregate metric. */
export function pivot(
  rows: ReadonlyArray<IRowLike>,
  rowField: string,
  colField: string,
  metricField: string,
  agg: AggregationFn = 'sum'
): { rows: ReadonlyArray<string>; cols: ReadonlyArray<string>; values: number[][] } {
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const buckets = new Map<string, { sum: number; count: number; min: number; max: number }>();

  for (const row of rows) {
    const r = asKey(row.cells[rowField]);
    const c = asKey(row.cells[colField]);
    rowSet.add(r);
    colSet.add(c);
    const m = asNumber(row.cells[metricField]) ?? 0;
    const key = `${r}${c}`;
    const entry = buckets.get(key) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity };
    entry.sum += m;
    entry.count += 1;
    if (m < entry.min) entry.min = m;
    if (m > entry.max) entry.max = m;
    buckets.set(key, entry);
  }
  const rowsArr = [...rowSet].sort();
  const colsArr = [...colSet].sort();
  const values = rowsArr.map((r) =>
    colsArr.map((c) => {
      const e = buckets.get(`${r}${c}`);
      if (!e) return 0;
      switch (agg) {
        case 'sum':
          return e.sum;
        case 'avg':
          return e.count > 0 ? e.sum / e.count : 0;
        case 'min':
          return e.min === Infinity ? 0 : e.min;
        case 'max':
          return e.max === -Infinity ? 0 : e.max;
        case 'count':
          return e.count;
        default:
          return e.sum;
      }
    })
  );
  return { rows: rowsArr, cols: colsArr, values };
}

/** Top-N helper used by pie/bar widgets. */
export function topN(points: ReadonlyArray<IWidgetSeriesPoint>, n: number): IWidgetSeriesPoint[] {
  const sorted = [...points].sort((a, b) => b.metric - a.metric);
  return sorted.slice(0, n);
}

/** Dispatch rendering: takes a binding, raw rows, and produces the result for a kind. */
export function renderWidget(
  instance: IWidgetInstance,
  rows: ReadonlyArray<IRowLike>
): IWidgetRenderResult {
  const def = findWidgetDefinition(instance.definition);
  const title =
    typeof instance.options.title === 'string'
      ? instance.options.title
      : def?.title ?? instance.definition;

  switch (instance.definition) {
    case 'kpi':
    case 'counter': {
      const points = aggregate(rows, instance.binding);
      const scalar = points.reduce((a, p) => a + p.metric, 0);
      return { kind: instance.definition, title, points: [], scalar };
    }
    case 'table': {
      return { kind: 'table', title, points: [] };
    }
    case 'pivot': {
      const rowField = instance.binding.dimensionFieldId;
      const colField = instance.binding.columnFieldId ?? rowField;
      const metricField = instance.binding.metricFieldId ?? '';
      const agg = instance.binding.aggregation ?? 'sum';
      const matrix = pivot(rows, rowField, colField, metricField, agg);
      return { kind: 'pivot', title, points: [], matrix };
    }
    case 'line':
    case 'bar':
    case 'pie':
    default: {
      const points = aggregate(rows, instance.binding);
      return { kind: instance.definition, title, points };
    }
  }
}
