/**
 * View Layout Engine — pure helpers spec (Stage 113).
 */

import {
  computeLayout,
  effectiveViewport,
  layoutCalendar,
  layoutForm,
  layoutGallery,
  layoutGrid,
  layoutKanban,
  layoutMap,
  layoutTimeline,
} from './view-layout-engine.service';
import { ViewportSpec } from './view-layout-engine.types';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

function vp(over: Partial<ViewportSpec> = {}): ViewportSpec {
  return { width: 1200, height: 800, dpr: 1, ...over };
}
function gridMeta(over: Partial<ViewMetadataSpec> = {}): ViewMetadataSpec {
  return {
    id: 'v1',
    name: 'V',
    kind: 'grid',
    version: 1,
    options: {},
    columns: [
      { id: 'a', width: 100 },
      { id: 'b', width: 200 },
      { id: 'c', width: 50, hidden: true },
    ],
    filters: [],
    sorts: [],
    groups: [],
    condFormats: [],
    ...over,
  };
}

describe('view-layout-engine.effectiveViewport', () => {
  it('clamps', () => {
    expect(effectiveViewport({ width: -10, height: 800, dpr: 1 }).width).toBe(0);
  });
});

describe('view-layout-engine.layoutGrid', () => {
  it('basic', () => {
    const l = layoutGrid(gridMeta(), vp(), 3);
    expect(l.kind).toBe('grid');
    expect(l.cells.length).toBe(6);
    expect(l.totalWidth).toBeGreaterThan(0);
  });
  it('hidden columns excluded', () => {
    const l = layoutGrid(gridMeta(), vp(), 1);
    expect(l.cells.length).toBe(2);
  });
  it('rowHeight respects option', () => {
    const l = layoutGrid(gridMeta({ options: { rowHeight: 'tall' } }), vp(), 1);
    expect(l.rowHeight).toBe(48);
  });
  it('headerHeight constant', () => {
    expect(layoutGrid(gridMeta(), vp(), 0).headerHeight).toBe(32);
  });
});

describe('view-layout-engine.layoutKanban', () => {
  it('columns', () => {
    const l = layoutKanban(gridMeta({ kind: 'kanban' }), vp(), [
      { id: 'todo', label: 'To Do', count: 3 },
      { id: 'done', label: 'Done', count: 5 },
    ]);
    expect(l.kind).toBe('kanban');
    expect(l.columns.length).toBe(2);
    expect(l.columns[0].cardCount).toBe(3);
  });
});

describe('view-layout-engine.layoutGallery', () => {
  it('cards', () => {
    const l = layoutGallery(gridMeta({ kind: 'gallery' }), vp(), 6);
    expect(l.cards.length).toBe(6);
    expect(l.columns).toBeGreaterThan(0);
  });
});

describe('view-layout-engine.layoutCalendar', () => {
  it('month', () => {
    const l = layoutCalendar(vp(), 2025, 0);
    expect(l.cells.length).toBe(31);
    expect(l.weekRows).toBeGreaterThan(0);
  });
  it('feb', () => {
    const l = layoutCalendar(vp(), 2025, 1);
    expect(l.cells.length).toBe(28);
  });
});

describe('view-layout-engine.layoutForm', () => {
  it('fields', () => {
    const l = layoutForm(gridMeta({ kind: 'form' }), vp());
    expect(l.fields.length).toBe(2);
    expect(l.totalHeight).toBe(112);
  });
});

describe('view-layout-engine.layoutMap', () => {
  it('markers', () => {
    const l = layoutMap(vp(), [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]);
    expect(l.markers.length).toBe(2);
  });
});

describe('view-layout-engine.layoutTimeline', () => {
  it('bars', () => {
    const l = layoutTimeline(vp(), 3, ['A', 'B', 'C']);
    expect(l.bars.length).toBe(3);
    expect(l.bars[2].label).toBe('C');
  });
});

describe('view-layout-engine.computeLayout dispatch', () => {
  it('grid', () => {
    const l = computeLayout(gridMeta(), vp(), { rows: 2 });
    expect(l.kind).toBe('grid');
  });
  it('kanban', () => {
    const l = computeLayout(gridMeta({ kind: 'kanban' }), vp(), { buckets: [{ id: 'x', label: 'X', count: 1 }] });
    expect(l.kind).toBe('kanban');
  });
  it('gallery', () => {
    const l = computeLayout(gridMeta({ kind: 'gallery' }), vp(), { cards: 4 });
    expect(l.kind).toBe('gallery');
  });
  it('calendar', () => {
    const l = computeLayout(gridMeta({ kind: 'calendar' }), vp(), { year: 2025, month: 0 });
    expect(l.kind).toBe('calendar');
  });
  it('form', () => {
    const l = computeLayout(gridMeta({ kind: 'form' }), vp());
    expect(l.kind).toBe('form');
  });
  it('map', () => {
    const l = computeLayout(gridMeta({ kind: 'map' }), vp(), { markers: [{ lat: 1, lng: 2 }] });
    expect(l.kind).toBe('map');
  });
  it('timeline', () => {
    const l = computeLayout(gridMeta({ kind: 'timeline' }), vp(), { barLabels: ['A'] });
    expect(l.kind).toBe('timeline');
  });
});