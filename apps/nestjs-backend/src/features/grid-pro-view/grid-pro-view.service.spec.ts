/**
 * Grid Pro View — pure helpers spec (Stage 116).
 */

import {
  buildSpec,
  columnSummary,
  findCell,
  renderGridPro,
  scrollOffsetForRow,
  withinRowCap,
  windowCells,
} from './grid-pro-view.service';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

function meta(over: Partial<ViewMetadataSpec> = {}): ViewMetadataSpec {
  return {
    id: 'v1', name: 'V', kind: 'grid', version: 1, options: {},
    columns: [{ id: 'a', width: 100 }, { id: 'b', width: 200 }],
    filters: [], sorts: [], groups: [], condFormats: [], ...over,
  };
}

describe('grid-pro-view.renderGridPro', () => {
  it('renders cells for visible columns and rows', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta(), rows: ['r1', 'r2'] });
    const r = renderGridPro(spec, [
      { rowId: 'r1', fieldId: 'a', value: 'hello' },
      { rowId: 'r2', fieldId: 'b', value: 42 },
    ]);
    expect(r.totalRows).toBe(2);
    expect(r.cells.length).toBe(4);
    expect(r.cells.find((c) => c.rowId === 'r1' && c.fieldId === 'a')!.text).toBe('hello');
  });
  it('hidden columns excluded', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta({ columns: [{ id: 'a', width: 100 }, { id: 'b', width: 200, hidden: true }] }), rows: ['r1'] });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(r.cells.length).toBe(1);
  });
  it('rowHeight respects option', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta({ options: { rowHeight: 'tall' } }), rows: ['r1'] });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(r.cells[0].style.height).toBe(48);
  });
  it('color rule applied', () => {
    const spec = buildSpec({
      viewId: 'v',
      meta: meta(),
      rows: ['r1'],
      condFormatRules: [{ fieldId: 'a', op: 'equals', value: 'hot', visualization: 'color', style: '#f00' }],
    });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 'hot' }]);
    expect(r.cells[0].style.background).toBe('#f00');
  });
  it('icon rule applied', () => {
    const spec = buildSpec({
      viewId: 'v', meta: meta(), rows: ['r1'],
      condFormatRules: [{ fieldId: 'a', op: 'equals', value: 1, visualization: 'icon', style: 'star' }],
    });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(r.cells[0].style.icon).toBe('star');
  });
  it('bar rule applied', () => {
    const spec = buildSpec({
      viewId: 'v', meta: meta(), rows: ['r1'],
      condFormatRules: [{ fieldId: 'a', op: 'gt', value: 0, visualization: 'bar', style: '#0f0' }],
    });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 100 }]);
    expect(r.cells[0].style.barIntensity).toBeGreaterThan(0);
  });
  it('formats string / number / boolean', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta(), rows: ['r1'] });
    const r = renderGridPro(spec, [
      { rowId: 'r1', fieldId: 'a', value: true },
      { rowId: 'r1', fieldId: 'b', value: 3.14 },
    ]);
    expect(r.cells[0].text).toBe('true');
    expect(r.cells[1].text).toBe('3.14');
  });
  it('null / undefined render empty', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta(), rows: ['r1'] });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: null }]);
    expect(r.cells[0].text).toBe('');
  });
});

describe('grid-pro-view.scrollOffsetForRow', () => {
  it('respects headerHeight', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta(), rows: [] });
    expect(scrollOffsetForRow(spec, 0)).toBe(32);
    expect(scrollOffsetForRow(spec, 5)).toBe(32 + 5 * 32);
  });
});

describe('grid-pro-view.windowCells', () => {
  it('returns cells', () => {
    const spec = buildSpec({ viewId: 'v', meta: meta(), rows: ['r1', 'r2'] });
    const r = renderGridPro(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(windowCells(r, 0, 1).length).toBeGreaterThan(0);
  });
});

describe('grid-pro-view.withinRowCap', () => {
  it('under cap', () => {
    expect(withinRowCap(buildSpec({ viewId: 'v', meta: meta(), rows: ['r1'] }))).toBe(true);
  });
});

describe('grid-pro-view.columnSummary', () => {
  it('counts', () => {
    const s = columnSummary(buildSpec({ viewId: 'v', meta: meta({ columns: [{ id: 'a', width: 100 }, { id: 'b', width: 100, hidden: true }] }), rows: [] }));
    expect(s.visible).toBe(1);
    expect(s.total).toBe(2);
  });
});

describe('grid-pro-view.findCell', () => {
  it('finds', () => {
    const cells = [{ rowId: 'r1', fieldId: 'a', text: 'x', style: { width: 100, height: 32 } }];
    expect(findCell(cells, 'r1', 'a')).not.toBeNull();
  });
  it('misses', () => {
    expect(findCell([], 'r1', 'a')).toBeNull();
  });
});