/**
 * Dashboard widget market — Stage 55.
 *
 * Widgets are pluggable dashboard tiles bound to a data source (table or
 * saved query) and a renderer (line / bar / pie / KPI / counter / pivot).
 * The market is the registry that holds widget definitions; each
 * dashboard composes widget instances that reference registry entries.
 *
 * Pure types — no Prisma, no Nest.
 */

export type WidgetKind = 'line' | 'bar' | 'pie' | 'kpi' | 'counter' | 'pivot' | 'table';

export type AggregationFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct';

export interface IWidgetDataBinding {
  tableId: string;
  /** Optional view ID — when omitted, the widget reads the full table. */
  viewId?: string;
  /** Field used as the dimension on the X axis (group by). */
  dimensionFieldId: string;
  /** For pivot: secondary dimension rendered as columns. */
  columnFieldId?: string;
  /** Field used as the metric on the Y axis. */
  metricFieldId?: string;
  aggregation?: AggregationFn;
  /** Optional filter expression (referenced by id, evaluated by the auth layer). */
  filterId?: string;
}

export interface IWidgetDefinition {
  kind: WidgetKind;
  title: string;
  /** Allowed aggregation functions for this widget kind. */
  allowedAggregations: ReadonlyArray<AggregationFn>;
  /** Whether the widget needs a metric field (true) or can render from dimension only (false). */
  requiresMetric: boolean;
}

export interface IWidgetInstance {
  id: string;
  dashboardId: string;
  definition: WidgetKind;
  binding: IWidgetDataBinding;
  /** Grid position: x, y, width, height in tile units (1 unit ≈ 80px). */
  position: { x: number; y: number; w: number; h: number };
  /** Render options (color, label, units, etc.). */
  options: Record<string, unknown>;
}

export interface IWidgetSeriesPoint {
  dimension: string | number;
  metric: number;
}

export interface IWidgetRenderResult {
  kind: WidgetKind;
  title: string;
  points: ReadonlyArray<IWidgetSeriesPoint>;
  /** For `pivot`: rows × cols matrix. */
  matrix?: { rows: ReadonlyArray<string>; cols: ReadonlyArray<string>; values: number[][] };
  /** Aggregated scalar for KPI / counter widgets. */
  scalar?: number;
}

export const DEFAULT_WIDGET_WIDTH = 3;
export const DEFAULT_WIDGET_HEIGHT = 2;
export const MAX_WIDGET_INSTANCES_PER_DASHBOARD = 60;

export const WIDGET_DEFINITIONS: ReadonlyArray<IWidgetDefinition> = [
  {
    kind: 'line',
    title: '折线图',
    allowedAggregations: ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'],
    requiresMetric: true,
  },
  {
    kind: 'bar',
    title: '柱状图',
    allowedAggregations: ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'],
    requiresMetric: true,
  },
  {
    kind: 'pie',
    title: '饼图',
    allowedAggregations: ['sum', 'count', 'countDistinct'],
    requiresMetric: true,
  },
  {
    kind: 'kpi',
    title: 'KPI',
    allowedAggregations: ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'],
    requiresMetric: true,
  },
  {
    kind: 'counter',
    title: '计数器',
    allowedAggregations: ['count', 'countDistinct'],
    requiresMetric: false,
  },
  {
    kind: 'pivot',
    title: '透视表',
    allowedAggregations: ['sum', 'avg', 'min', 'max', 'count'],
    requiresMetric: true,
  },
  {
    kind: 'table',
    title: '嵌入表格',
    allowedAggregations: [],
    requiresMetric: false,
  },
];

export function findWidgetDefinition(kind: WidgetKind): IWidgetDefinition | undefined {
  return WIDGET_DEFINITIONS.find((w) => w.kind === kind);
}
