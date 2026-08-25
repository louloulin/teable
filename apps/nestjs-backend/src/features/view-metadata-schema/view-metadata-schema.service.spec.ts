/**
 * View Metadata Schema — pure helpers spec (Stage 112).
 */

import {
  addColumn,
  addCondFormat,
  addFilter,
  addGroup,
  addSort,
  emptyViewMetadata,
  listPinnedColumns,
  listVisibleColumns,
  migrateViewMetadata,
  removeColumn,
  reorderColumns,
  serializeViewMetadata,
  setColumnWidth,
  summarizeViewMetadata,
  toggleColumnHidden,
  toggleColumnPinned,
  totalWidth,
  validateViewMetadata,
} from './view-metadata-schema.service';
import { ViewMetadataSpec } from './view-metadata-schema.types';

function meta(over: Partial<ViewMetadataSpec> = {}): ViewMetadataSpec {
  return {
    id: 'v1',
    name: 'V',
    kind: 'grid',
    version: 1,
    options: {},
    columns: [
      { id: 'a', width: 100 },
      { id: 'b', width: 200 },
    ],
    filters: [],
    sorts: [],
    groups: [],
    condFormats: [],
    ...over,
  };
}

describe('view-metadata-schema.emptyViewMetadata', () => {
  it('grid defaults', () => {
    const m = emptyViewMetadata({ id: 'v', name: 'X', kind: 'grid' });
    expect(m.kind).toBe('grid');
    expect(m.version).toBe(1);
    expect(m.columns).toEqual([]);
  });
  it('kanban defaults', () => {
    const m = emptyViewMetadata({ id: 'v', name: 'X', kind: 'kanban' });
    expect(m.options.stackBy).toBeNull();
  });
});

describe('view-metadata-schema.validate', () => {
  it('valid', () => {
    expect(validateViewMetadata(meta()).ok).toBe(true);
  });
  it('bad name', () => {
    const v = validateViewMetadata(meta({ name: '!!!' }));
    expect(v.issues.some((i) => i.field === 'name')).toBe(true);
  });
  it('too many columns', () => {
    const cols = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, width: 50 }));
    const v = validateViewMetadata(meta({ columns: cols }));
    expect(v.issues.some((i) => i.field === 'columns')).toBe(true);
  });
  it('filter missing fieldId', () => {
    const v = validateViewMetadata(meta({ filters: [{ id: 'f1', fieldId: '', op: 'equals' }] }));
    expect(v.ok).toBe(false);
  });
});

describe('view-metadata-schema.column ops', () => {
  it('addColumn idempotent', () => {
    const m0 = meta();
    const m1 = addColumn(m0, { id: 'a', width: 100 });
    expect(m1.columns.length).toBe(m0.columns.length);
  });
  it('removeColumn cleans related', () => {
    const m = removeColumn(meta({
      filters: [{ id: 'f', fieldId: 'a', op: 'equals' }],
      sorts: [{ id: 's', fieldId: 'a', direction: 'asc' }],
      groups: [{ id: 'g', fieldId: 'a' }],
      condFormats: [{ id: 'c', fieldId: 'a', op: 'equals', value: 1, visualization: 'color' }],
    }), 'a');
    expect(m.columns.length).toBe(1);
    expect(m.filters.length).toBe(0);
    expect(m.sorts.length).toBe(0);
  });
  it('reorderColumns', () => {
    const m = reorderColumns(meta(), 'b', 0);
    expect(m.columns[0].id).toBe('b');
  });
  it('setColumnWidth', () => {
    const m = setColumnWidth(meta(), 'a', 500);
    expect(m.columns[0].width).toBe(500);
  });
  it('toggleHidden / togglePinned', () => {
    const m = toggleColumnHidden(meta(), 'a');
    expect(m.columns[0].hidden).toBe(true);
    const m2 = toggleColumnPinned(m, 'b');
    expect(m2.columns[1].pinned).toBe(true);
  });
});

describe('view-metadata-schema.filter / sort / group / condFormat add', () => {
  it('addFilter / addSort / addGroup / addCondFormat', () => {
    const m = addFilter(meta(), { id: 'f', fieldId: 'a', op: 'equals', value: 1 });
    const m2 = addSort(m, { id: 's', fieldId: 'a', direction: 'asc' });
    const m3 = addGroup(m2, { id: 'g', fieldId: 'a' });
    const m4 = addCondFormat(m3, { id: 'c', fieldId: 'a', op: 'equals', value: 1, visualization: 'color' });
    expect(m4.filters.length).toBe(1);
    expect(m4.sorts.length).toBe(1);
    expect(m4.groups.length).toBe(1);
    expect(m4.condFormats.length).toBe(1);
  });
});

describe('view-metadata-schema.listVisible / listPinned / totalWidth', () => {
  it('visible excludes hidden', () => {
    const m = meta();
    const m2 = toggleColumnHidden(m, 'a');
    expect(listVisibleColumns(m2).length).toBe(1);
  });
  it('pinned', () => {
    const m = toggleColumnPinned(meta(), 'a');
    expect(listPinnedColumns(m).length).toBe(1);
  });
  it('totalWidth', () => {
    expect(totalWidth(meta())).toBe(300);
  });
});

describe('view-metadata-schema.serialize / summarize / migrate', () => {
  it('serialize', () => {
    expect(serializeViewMetadata(meta()).length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const s = summarizeViewMetadata(meta());
    expect(s.kind).toBe('grid');
    expect(s.columns).toBe(2);
  });
  it('migrate', () => {
    const m = migrateViewMetadata({ ...meta(), version: 0 as 1 });
    expect(m.version).toBe(1);
  });
});