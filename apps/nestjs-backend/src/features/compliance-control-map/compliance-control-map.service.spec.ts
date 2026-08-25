/**
 * Compliance Control Map — pure helpers spec (Stage 122).
 */

import {
  BUILTIN_CONTROLS,
  buildControlMap,
  coveragePercent,
  filterByCategory,
  filterByFramework,
  findMissingEvidence,
  hashMap,
  isControlIdValid,
  requirementsFor,
  serializeMap,
  updateStatus,
} from './compliance-control-map.service';
import { ControlItem, ControlMapEntry } from './compliance-control-map.types';

describe('compliance-control-map.library', () => {
  it('has SOC2 + ISO27001', () => {
    expect(BUILTIN_CONTROLS.some((c) => c.framework === 'SOC2')).toBe(true);
    expect(BUILTIN_CONTROLS.some((c) => c.framework === 'ISO27001')).toBe(true);
  });
});

describe('compliance-control-map.requirementsFor', () => {
  it('derived', () => {
    const reqs = requirementsFor(BUILTIN_CONTROLS[0]);
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0].controlId).toBe('SOC2-CC6.1');
  });
});

describe('compliance-control-map.buildControlMap', () => {
  it('default', () => {
    const m = buildControlMap();
    expect(m.length).toBe(BUILTIN_CONTROLS.length);
  });
  it('with extras', () => {
    const extra: ControlItem = { id: 'SOC2-CC6.99', framework: 'SOC2', category: 'access_control', title: 'x', description: 'y', evidence: ['query_log'], status: 'not_started' };
    expect(buildControlMap([extra]).length).toBe(BUILTIN_CONTROLS.length + 1);
  });
});

describe('compliance-control-map.filterByFramework / filterByCategory', () => {
  it('framework', () => {
    expect(filterByFramework(buildControlMap(), 'SOC2').length).toBeGreaterThan(0);
    expect(filterByFramework(buildControlMap(), 'ISO27001').length).toBeGreaterThan(0);
  });
  it('category', () => {
    expect(filterByCategory(buildControlMap(), 'logging').length).toBeGreaterThan(0);
  });
});

describe('compliance-control-map.updateStatus', () => {
  it('updates', () => {
    const c = updateStatus(BUILTIN_CONTROLS[0], 'attested', '2026-08-25');
    expect(c.status).toBe('attested');
    expect(c.updatedAt).toBe('2026-08-25');
  });
});

describe('compliance-control-map.isControlIdValid', () => {
  it('SOC2', () => expect(isControlIdValid('SOC2-CC6.1')).toBe(true));
  it('ISO', () => expect(isControlIdValid('ISO-A.9.1')).toBe(true));
  it('bad', () => expect(isControlIdValid('random')).toBe(false));
});

describe('compliance-control-map.findMissingEvidence', () => {
  it('empty evidence', () => {
    const report = findMissingEvidence(buildControlMap(), new Map());
    expect(report.missing.length).toBeGreaterThan(0);
  });
  it('full coverage', () => {
    const map = buildControlMap();
    const full = new Map<string, Set<import('./compliance-control-map.types').EvidenceKind>>();
    for (const e of map) {
      full.set(e.control.id, new Set(e.control.evidence));
    }
    const report = findMissingEvidence(map, full);
    expect(report.missing.length).toBe(0);
  });
});

describe('compliance-control-map.coveragePercent', () => {
  it('zero', () => {
    expect(coveragePercent({ total: 0, attested: 0, verified: 0, failed: 0, missing: [] })).toBe(100);
  });
  it('half', () => {
    expect(coveragePercent({ total: 4, attested: 2, verified: 0, failed: 0, missing: [] })).toBe(50);
  });
});

describe('compliance-control-map.serialize / hash', () => {
  it('serialize', () => {
    expect(serializeMap(buildControlMap()).length).toBeGreaterThan(0);
  });
  it('hash stable', () => {
    expect(hashMap(buildControlMap())).toBe(hashMap(buildControlMap()));
  });
});