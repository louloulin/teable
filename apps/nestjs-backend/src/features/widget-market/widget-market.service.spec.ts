/* eslint-disable @typescript-eslint/naming-convention */
import {
  aggregate,
  defaultPosition,
  isAggregationFn,
  isWidgetKind,
  newWidgetInstanceId,
  pivot,
  renderWidget,
  topN,
  validateWidgetInstance,
} from './widget-market.service';
import type { IWidgetInstance } from './widget-market.types';
import { WIDGET_DEFINITIONS } from './widget-market.types';

describe('widget-market.registry', () => {
  it('lists 7 widget kinds', () => {
    expect(WIDGET_DEFINITIONS).toHaveLength(7);
  });
  it('all kinds are valid', () => {
    for (const def of WIDGET_DEFINITIONS) {
      expect(isWidgetKind(def.kind)).toBe(true);
    }
  });
  it('identifies aggregations', () => {
    expect(isAggregationFn('sum')).toBe(true);
    expect(isAggregationFn('bogus' as never)).toBe(false);
  });
});

describe('widget-market.validate', () => {
  const baseInstance: IWidgetInstance = {
    id: 'w1',
    dashboardId: 'd1',
    definition: 'line',
    binding: { tableId: 't1', dimensionFieldId: 'cat', metricFieldId: 'val', aggregation: 'sum' },
    position: { x: 0, y: 0, w: 3, h: 2 },
    options: {},
  };
  it('accepts a valid instance', () => {
    expect(validateWidgetInstance(baseInstance, 0)).toBeNull();
  });
  it('rejects unknown kind', () => {
    const bad = { ...baseInstance, definition: 'flamechart' as never };
    expect(validateWidgetInstance(bad, 0)).toContain('unsupported widget kind');
  });
  it('requires metric for line', () => {
    const bad = JSON.parse(JSON.stringify(baseInstance)) as IWidgetInstance;
    bad.binding.metricFieldId = undefined;
    expect(validateWidgetInstance(bad, 0)).toContain('requires a metricFieldId');
  });
  it('rejects disallowed aggregation', () => {
    const bad = JSON.parse(JSON.stringify(baseInstance)) as IWidgetInstance;
    bad.binding.aggregation = 'sum';
    bad.definition = 'pie';
    bad.binding.metricFieldId = 'val';
    expect(validateWidgetInstance(bad, 0)).toBeNull();
    bad.binding.aggregation = 'avg' as never;
    expect(validateWidgetInstance(bad, 0)).toContain('not allowed');
  });
  it('caps at MAX_WIDGET_INSTANCES_PER_DASHBOARD', () => {
    expect(validateWidgetInstance(baseInstance, 9999)).toContain('too many');
  });
  it('rejects zero/negative dimensions', () => {
    const bad = JSON.parse(JSON.stringify(baseInstance)) as IWidgetInstance;
    bad.position.w = 0;
    expect(validateWidgetInstance(bad, 0)).toContain('w and position.h');
  });
});

describe('widget-market.aggregate', () => {
  const rows = [
    { cells: { cat: 'A', val: 1 } },
    { cells: { cat: 'A', val: 3 } },
    { cells: { cat: 'B', val: 7 } },
    { cells: { cat: 'B', val: null } },
  ];
  it('groups and sums', () => {
    const out = aggregate(rows, {
      tableId: 't',
      dimensionFieldId: 'cat',
      metricFieldId: 'val',
      aggregation: 'sum',
    });
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.dimension === 'A')?.metric).toBe(4);
    expect(out.find((p) => p.dimension === 'B')?.metric).toBe(7);
  });
  it('averages', () => {
    const out = aggregate(rows, {
      tableId: 't',
      dimensionFieldId: 'cat',
      metricFieldId: 'val',
      aggregation: 'avg',
    });
    expect(out.find((p) => p.dimension === 'A')?.metric).toBe(2);
  });
  it('counts', () => {
    const out = aggregate(rows, { tableId: 't', dimensionFieldId: 'cat', aggregation: 'count' });
    expect(out.find((p) => p.dimension === 'B')?.metric).toBe(2);
  });
  it('handles min / max', () => {
    const mn = aggregate(rows, {
      tableId: 't',
      dimensionFieldId: 'cat',
      metricFieldId: 'val',
      aggregation: 'min',
    });
    const mx = aggregate(rows, {
      tableId: 't',
      dimensionFieldId: 'cat',
      metricFieldId: 'val',
      aggregation: 'max',
    });
    expect(mn.find((p) => p.dimension === 'A')?.metric).toBe(1);
    expect(mx.find((p) => p.dimension === 'B')?.metric).toBe(7);
  });
  it('handles distinct count', () => {
    const out = aggregate(rows, {
      tableId: 't',
      dimensionFieldId: 'cat',
      aggregation: 'countDistinct',
    });
    expect(out).toHaveLength(2);
    expect(out.reduce((a, p) => a + p.metric, 0)).toBe(2);
  });
  it('returns sorted output', () => {
    const out = aggregate(rows, { tableId: 't', dimensionFieldId: 'cat', aggregation: 'count' });
    expect(out.map((p) => p.dimension)).toEqual(['A', 'B']);
  });
});

describe('widget-market.pivot', () => {
  const rows = [
    { cells: { row: 'X', col: 'Q1', val: 10 } },
    { cells: { row: 'X', col: 'Q2', val: 5 } },
    { cells: { row: 'Y', col: 'Q1', val: 3 } },
    { cells: { row: 'Y', col: 'Q2', val: 8 } },
  ];
  it('builds a 2x2 matrix', () => {
    const m = pivot(rows, 'row', 'col', 'val', 'sum');
    expect(m.rows).toEqual(['X', 'Y']);
    expect(m.cols).toEqual(['Q1', 'Q2']);
    expect(m.values).toEqual([
      [10, 5],
      [3, 8],
    ]);
  });
  it('averages', () => {
    const m = pivot(rows, 'row', 'col', 'val', 'avg');
    expect(m.values[0]?.[0]).toBe(10);
  });
  it('handles missing cells', () => {
    const partial = [
      { cells: { row: 'X', col: 'Q1', val: 10 } },
      { cells: { row: 'Y', col: 'Q2', val: 5 } },
    ];
    const m = pivot(partial, 'row', 'col', 'val', 'sum');
    expect(m.values[0]?.[1]).toBe(0);
    expect(m.values[1]?.[0]).toBe(0);
    expect(m.values[1]?.[1]).toBe(5);
  });
});

describe('widget-market.topN', () => {
  it('returns top N by metric desc', () => {
    const out = topN(
      [
        { dimension: 'a', metric: 1 },
        { dimension: 'b', metric: 9 },
        { dimension: 'c', metric: 3 },
      ],
      2
    );
    expect(out.map((p) => p.dimension)).toEqual(['b', 'c']);
  });
});

describe('widget-market.renderWidget', () => {
  const rows = [{ cells: { cat: 'A', val: 1 } }, { cells: { cat: 'B', val: 5 } }];
  it('renders line/bar/pie via aggregate', () => {
    const inst: IWidgetInstance = {
      id: 'w',
      dashboardId: 'd',
      definition: 'line',
      binding: { tableId: 't', dimensionFieldId: 'cat', metricFieldId: 'val', aggregation: 'sum' },
      position: { x: 0, y: 0, w: 3, h: 2 },
      options: {},
    };
    const out = renderWidget(inst, rows);
    expect(out.kind).toBe('line');
    expect(out.points).toHaveLength(2);
  });
  it('renders KPI scalar', () => {
    const inst: IWidgetInstance = {
      id: 'w',
      dashboardId: 'd',
      definition: 'kpi',
      binding: { tableId: 't', dimensionFieldId: 'cat', metricFieldId: 'val', aggregation: 'sum' },
      position: { x: 0, y: 0, w: 3, h: 2 },
      options: {},
    };
    const out = renderWidget(inst, rows);
    expect(out.scalar).toBe(6);
  });
  it('renders counter', () => {
    const inst: IWidgetInstance = {
      id: 'w',
      dashboardId: 'd',
      definition: 'counter',
      binding: { tableId: 't', dimensionFieldId: 'cat', aggregation: 'count' },
      position: { x: 0, y: 0, w: 3, h: 2 },
      options: {},
    };
    const out = renderWidget(inst, rows);
    expect(out.scalar).toBe(2);
  });
  it('renders pivot', () => {
    const inst: IWidgetInstance = {
      id: 'w',
      dashboardId: 'd',
      definition: 'pivot',
      binding: {
        tableId: 't',
        dimensionFieldId: 'row',
        columnFieldId: 'col',
        metricFieldId: 'val',
        aggregation: 'sum',
      },
      position: { x: 0, y: 0, w: 3, h: 2 },
      options: {},
    };
    const out = renderWidget(inst, [
      { cells: { row: 'X', col: 'Q', val: 1 } },
      { cells: { row: 'X', col: 'Q', val: 2 } },
    ]);
    expect(out.matrix?.values[0]?.[0]).toBe(3);
  });
});

describe('widget-market.defaultPosition', () => {
  it('lays out in 4-col grid', () => {
    expect(defaultPosition(0)).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    expect(defaultPosition(4).x).toBe(0);
    expect(defaultPosition(4).y).toBe(2);
  });
});

describe('widget-market.newWidgetInstanceId', () => {
  it('produces unique ids with prefix', () => {
    const a = newWidgetInstanceId();
    const b = newWidgetInstanceId();
    expect(a).toMatch(/^wgt_/);
    expect(a).not.toEqual(b);
  });
});
