/**
 * View Config Panel API — NestJS auth service spec (Stage 115).
 */

import { ViewConfigPanelApiAuthService } from './view-config-panel-api.auth.service';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ViewConfigPanelApiAuthService(makePrisma() as never);
}
function meta(): ViewMetadataSpec {
  return {
    id: 'v1', name: 'V', kind: 'grid', version: 1, options: {},
    columns: [{ id: 'a', width: 100 }], filters: [], sorts: [], groups: [], condFormats: [],
  };
}
function req() { return { viewId: 'v1', tableId: 't1', baseId: 'b1' }; }

describe('ViewConfigPanelApiAuthService.build / hash', () => {
  it('build', () => {
    const r = setup().build(req(), meta(), 'editor');
    expect(r.canEdit).toBe(true);
  });
  it('hash stable', () => {
    expect(setup().hash(meta())).toBe(setup().hash(meta()));
  });
});

describe('ViewConfigPanelApiAuthService.apply / process', () => {
  it('apply', () => {
    const r = setup().apply(meta(), [{ kind: 'filters', filters: [{ id: 'f', fieldId: 'a', op: 'equals' }] }]);
    expect(r.metadata.filters.length).toBe(1);
  });
  it('process ok', () => {
    const svc = setup();
    const m = meta();
    const h = svc.hash(m);
    const res = svc.process(m, h, [{ kind: 'sorts', sorts: [{ id: 's', fieldId: 'a', direction: 'asc' }] }]);
    expect(res.ok).toBe(true);
  });
  it('process conflict', () => {
    const res = setup().process(meta(), 'wrong', []);
    expect(res.ok).toBe(false);
  });
});

describe('ViewConfigPanelApiAuthService.diff / canEdit', () => {
  it('diff', () => {
    const m = meta();
    expect(setup().diff(m, { ...m, name: 'X' })).toContain('name');
  });
  it('canEdit', () => {
    expect(setup().canEdit('editor')).toBe(true);
    expect(setup().canEdit('viewer')).toBe(false);
  });
});

describe('ViewConfigPanelApiAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});