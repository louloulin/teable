/**
 * Grid Pro View — NestJS auth service spec (Stage 116).
 */

import { GridProViewAuthService } from './grid-pro-view.auth.service';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new GridProViewAuthService(makePrisma() as never);
}
function meta(): ViewMetadataSpec {
  return {
    id: 'v', name: 'V', kind: 'grid', version: 1, options: {},
    columns: [{ id: 'a', width: 100 }], filters: [], sorts: [], groups: [], condFormats: [],
  };
}

describe('GridProViewAuthService.render', () => {
  it('renders', () => {
    const svc = setup();
    const spec = svc.build({ viewId: 'v', meta: meta(), rows: ['r1'] });
    const r = svc.render(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(r.cells.length).toBe(1);
  });
});

describe('GridProViewAuthService.scroll / window / cap / summary / find', () => {
  it('scroll', () => {
    const svc = setup();
    const spec = svc.build({ viewId: 'v', meta: meta(), rows: ['r1'] });
    expect(svc.scroll(spec, 0)).toBe(32);
  });
  it('window', () => {
    const svc = setup();
    const spec = svc.build({ viewId: 'v', meta: meta(), rows: ['r1'] });
    const r = svc.render(spec, [{ rowId: 'r1', fieldId: 'a', value: 1 }]);
    expect(svc.window(r, 0, 1).length).toBe(1);
  });
  it('withinCap', () => {
    const svc = setup();
    const spec = svc.build({ viewId: 'v', meta: meta(), rows: ['r1'] });
    expect(svc.withinCap(spec)).toBe(true);
  });
  it('summary', () => {
    const svc = setup();
    const spec = svc.build({ viewId: 'v', meta: meta(), rows: [] });
    expect(svc.summary(spec).total).toBe(1);
  });
  it('find', () => {
    const svc = setup();
    const cells = [{ rowId: 'r1', fieldId: 'a', text: 'x', style: { width: 100, height: 32 } }];
    expect(svc.find(cells, 'r1', 'a')).not.toBeNull();
    expect(svc.find([], 'r1', 'a')).toBeNull();
  });
});

describe('GridProViewAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});