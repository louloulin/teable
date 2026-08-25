/**
 * View Layout Engine — NestJS auth service spec (Stage 113).
 */

import { ViewLayoutEngineAuthService } from './view-layout-engine.auth.service';
import { ViewportSpec } from './view-layout-engine.types';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ViewLayoutEngineAuthService(makePrisma() as never);
}
function vp(): ViewportSpec { return { width: 1000, height: 600, dpr: 1 }; }
function meta(): ViewMetadataSpec {
  return {
    id: 'v', name: 'V', kind: 'grid', version: 1, options: {},
    columns: [{ id: 'a', width: 100 }, { id: 'b', width: 200 }],
    filters: [], sorts: [], groups: [], condFormats: [],
  };
}

describe('ViewLayoutEngineAuthService.layout dispatch', () => {
  it('grid', () => {
    expect(setup().layout(meta(), vp(), { rows: 2 }).kind).toBe('grid');
  });
  it('kanban', () => {
    expect(setup().layout({ ...meta(), kind: 'kanban' }, vp(), { buckets: [{ id: 'x', label: 'X', count: 1 }] }).kind).toBe('kanban');
  });
  it('gallery', () => {
    expect(setup().layout({ ...meta(), kind: 'gallery' }, vp(), { cards: 3 }).kind).toBe('gallery');
  });
  it('calendar', () => {
    expect(setup().layout({ ...meta(), kind: 'calendar' }, vp(), { year: 2025, month: 0 }).kind).toBe('calendar');
  });
  it('form', () => {
    expect(setup().layout({ ...meta(), kind: 'form' }, vp()).kind).toBe('form');
  });
  it('map', () => {
    expect(setup().layout({ ...meta(), kind: 'map' }, vp(), { markers: [{ lat: 0, lng: 0 }] }).kind).toBe('map');
  });
  it('timeline', () => {
    expect(setup().layout({ ...meta(), kind: 'timeline' }, vp(), { barLabels: ['A'] }).kind).toBe('timeline');
  });
});

describe('ViewLayoutEngineAuthService direct layout functions', () => {
  it('grid', () => {
    const l = setup().grid(meta(), vp(), 2);
    expect(l.kind).toBe('grid');
  });
  it('kanban', () => {
    expect(setup().kanban(meta(), vp(), [{ id: 'a', label: 'A', count: 1 }]).kind).toBe('kanban');
  });
  it('gallery', () => {
    expect(setup().gallery(meta(), vp(), 2).kind).toBe('gallery');
  });
  it('calendar', () => {
    expect(setup().calendar(vp(), 2025, 0).kind).toBe('calendar');
  });
  it('form', () => {
    expect(setup().form(meta(), vp()).kind).toBe('form');
  });
  it('map', () => {
    expect(setup().map(vp(), [{ lat: 1, lng: 2 }]).kind).toBe('map');
  });
  it('timeline', () => {
    expect(setup().timeline(vp(), ['A']).kind).toBe('timeline');
  });
});

describe('ViewLayoutEngineAuthService.effectiveViewport', () => {
  it('clamps', () => {
    expect(setup().effectiveViewport({ width: -1, height: 800, dpr: 1 }).width).toBe(0);
  });
});

describe('ViewLayoutEngineAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});