/**
 * View Metadata Schema — NestJS auth service spec (Stage 112).
 */

import { ViewMetadataSchemaAuthService } from './view-metadata-schema.auth.service';
import { ViewMetadataSpec } from './view-metadata-schema.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ViewMetadataSchemaAuthService(makePrisma() as never);
}
function meta(): ViewMetadataSpec {
  return {
    id: 'v1',
    name: 'V',
    kind: 'grid',
    version: 1,
    options: {},
    columns: [{ id: 'a', width: 100 }],
    filters: [],
    sorts: [],
    groups: [],
    condFormats: [],
  };
}

describe('ViewMetadataSchemaAuthService.empty / validate', () => {
  it('empty grid', () => {
    const svc = setup();
    const m = svc.empty('v', 'X', 'grid');
    expect(m.kind).toBe('grid');
  });
  it('validate ok', () => {
    const svc = setup();
    expect(svc.validate(meta()).ok).toBe(true);
  });
});

describe('ViewMetadataSchemaAuthService column ops', () => {
  it('addColumn / removeColumn / reorderColumns / setColumnWidth / toggleHidden / togglePinned', () => {
    const svc = setup();
    const m0 = meta();
    const m1 = svc.addColumn(m0, { id: 'b', width: 50 });
    expect(m1.columns.length).toBe(2);
    const m2 = svc.removeColumn(m1, 'b');
    expect(m2.columns.length).toBe(1);
    const m3 = svc.reorderColumns(svc.addColumn(m2, { id: 'b', width: 50 }), 'a', 1);
    expect(m3.columns[0].id).toBe('b');
    const m4 = svc.setColumnWidth(m3, 'b', 200);
    expect(m4.columns.find((c) => c.id === 'b')!.width).toBe(200);
    const m5 = svc.toggleHidden(m4, 'b');
    expect(m5.columns.find((c) => c.id === 'b')!.hidden).toBe(true);
    const m6 = svc.togglePinned(m5, 'b');
    expect(m6.columns.find((c) => c.id === 'b')!.pinned).toBe(true);
  });
});

describe('ViewMetadataSchemaAuthService filter / sort / group / condFormat', () => {
  it('addFilter / addSort / addGroup / addCondFormat', () => {
    const svc = setup();
    const m = svc.addFilter(meta(), { id: 'f', fieldId: 'a', op: 'equals' });
    const m2 = svc.addSort(m, { id: 's', fieldId: 'a', direction: 'asc' });
    const m3 = svc.addGroup(m2, { id: 'g', fieldId: 'a' });
    const m4 = svc.addCondFormat(m3, { id: 'c', fieldId: 'a', op: 'equals', value: 1, visualization: 'color' });
    expect(m4.condFormats.length).toBe(1);
  });
});

describe('ViewMetadataSchemaAuthService visible / pinned / totalWidth / summarize / serialize / migrate', () => {
  it('visible / pinned / totalWidth', () => {
    const svc = setup();
    const m = svc.togglePinned(meta(), 'a');
    expect(svc.visibleColumns(m).length).toBe(1);
    expect(svc.pinnedColumns(m).length).toBe(1);
    expect(svc.totalWidth(m)).toBe(100);
  });
  it('summarize / serialize / migrate', () => {
    const svc = setup();
    expect(svc.summarize(meta()).kind).toBe('grid');
    expect(svc.serialize(meta()).length).toBeGreaterThan(0);
    expect(svc.migrate({ ...meta(), version: 0 as 1 }).version).toBe(1);
  });
});

describe('ViewMetadataSchemaAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});