/**
 * App module wiring — pure helpers spec (Stage 95).
 */

import {
  buildManifest,
  count,
  filterByCategory,
  filterByRound,
  findWire,
  hasAllRequired,
  installOrder,
  mergeManifests,
  requiredNames,
  validateWire,
} from './app-module-wiring.service';
import type { IModuleWire } from './app-module-wiring.types';

const baseWire = (over: Partial<IModuleWire> = {}): IModuleWire => ({
  name: 'X',
  category: 'feature',
  round: 18,
  required: true,
  ...over,
});

describe('app-module-wiring.validateWire', () => {
  it('passes', () => {
    expect(validateWire(baseWire())).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateWire(baseWire({ name: '' }))).toContain('name');
  });
  it('rejects bad category', () => {
    expect(validateWire(baseWire({ category: 'wat' as never }))).toContain('category');
  });
  it('rejects round < 1', () => {
    expect(validateWire(baseWire({ round: 0 }))).toContain('round');
  });
});

describe('app-module-wiring.buildManifest', () => {
  it('builds', () => {
    const m = buildManifest({ modules: [baseWire()] });
    expect(m.modules.length).toBe(1);
  });
  it('dedupes', () => {
    const m = buildManifest({
      modules: [baseWire({ name: 'X' }), baseWire({ name: 'X' })],
    });
    expect(count(m)).toBe(1);
  });
  it('throws on invalid', () => {
    expect(() => buildManifest({ modules: [baseWire({ name: '' })] })).toThrow();
  });
});

describe('app-module-wiring.findWire', () => {
  it('found', () => {
    const m = buildManifest({ modules: [baseWire()] });
    expect(findWire({ manifest: m, name: 'X' })?.name).toBe('X');
  });
  it('null', () => {
    expect(findWire({ manifest: buildManifest({ modules: [] }), name: 'nope' })).toBeNull();
  });
});

describe('app-module-wiring.mergeManifests', () => {
  it('merges', () => {
    const a = buildManifest({ modules: [baseWire({ name: 'A' })] });
    const b = buildManifest({ modules: [baseWire({ name: 'B' })] });
    expect(count(mergeManifests(a, b))).toBe(2);
  });
});

describe('app-module-wiring.filterByCategory', () => {
  it('filters', () => {
    const m = buildManifest({
      modules: [baseWire({ category: 'core' }), baseWire({ category: 'feature' })],
    });
    expect(filterByCategory({ manifest: m, category: 'core' }).length).toBe(1);
  });
});

describe('app-module-wiring.filterByRound', () => {
  it('filters', () => {
    const m = buildManifest({
      modules: [baseWire({ name: 'A', round: 17 }), baseWire({ name: 'B', round: 18 })],
    });
    expect(filterByRound({ manifest: m, round: 18 }).length).toBe(1);
  });
});

describe('app-module-wiring.requiredNames', () => {
  it('only required', () => {
    const m = buildManifest({
      modules: [baseWire({ name: 'A', required: true }), baseWire({ name: 'B', required: false })],
    });
    expect(requiredNames(m)).toEqual(['A']);
  });
});

describe('app-module-wiring.hasAllRequired', () => {
  it('yes', () => {
    const m = buildManifest({ modules: [baseWire({ name: 'A', required: true })] });
    expect(hasAllRequired({ manifest: m, provided: ['A'] })).toBe(true);
  });
  it('no', () => {
    const m = buildManifest({ modules: [baseWire({ name: 'A', required: true })] });
    expect(hasAllRequired({ manifest: m, provided: [] })).toBe(false);
  });
});

describe('app-module-wiring.installOrder', () => {
  it('orders core first', () => {
    const m = buildManifest({
      modules: [
        baseWire({ name: 'F', category: 'feature' }),
        baseWire({ name: 'C', category: 'core' }),
      ],
    });
    expect(installOrder(m)).toEqual(['C', 'F']);
  });
});