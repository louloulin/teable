/**
 * Module wiring — pure helpers spec (Stage 90).
 */

import {
  buildManifest,
  coverageStats,
  diffManifests,
  isComplete,
  patchEntry,
  validateEntry,
} from './module-wiring.service';
import { FEATURE_MODULE_NAMES } from './module-wiring.types';
import type { IModuleEntry } from './module-wiring.types';

const baseEntry = (over: Partial<IModuleEntry> = {}): IModuleEntry => ({
  name: 'risk-policy-engine',
  registered: true,
  hasController: true,
  guarded: true,
  ...over,
});

describe('module-wiring.validateEntry', () => {
  it('passes', () => {
    expect(validateEntry(baseEntry())).toBeNull();
  });
  it('rejects registered without controller', () => {
    expect(validateEntry(baseEntry({ hasController: false }))).toContain('no controller');
  });
  it('rejects guarded without controller', () => {
    expect(validateEntry(baseEntry({ registered: false, guarded: true, hasController: false }))).toContain(
      'guarded without controller'
    );
  });
});

describe('module-wiring.buildManifest', () => {
  it('flags missing modules', () => {
    const m = buildManifest({
      entries: [baseEntry()],
      generatedAt: '2026-01-01T00:00:00Z',
    });
    expect(m.missing.length).toBe(FEATURE_MODULE_NAMES.length - 1);
  });
  it('empty when complete', () => {
    const entries = FEATURE_MODULE_NAMES.map((name) => baseEntry({ name }));
    const m = buildManifest({ entries, generatedAt: '2026-01-01T00:00:00Z' });
    expect(m.missing.length).toBe(0);
  });
});

describe('module-wiring.isComplete', () => {
  it('true', () => {
    const entries = FEATURE_MODULE_NAMES.map((name) => baseEntry({ name }));
    const m = buildManifest({ entries, generatedAt: '2026-01-01T00:00:00Z' });
    expect(isComplete(m)).toBe(true);
  });
  it('false when missing', () => {
    const m = buildManifest({ entries: [], generatedAt: '2026-01-01T00:00:00Z' });
    expect(isComplete(m)).toBe(false);
  });
});

describe('module-wiring.coverageStats', () => {
  it('counts', () => {
    const out = coverageStats({ entries: [baseEntry(), baseEntry({ name: 'login-risk-anomaly', registered: false })] });
    expect(out.registered).toBe(1);
    expect(out.withController).toBe(2);
    expect(out.guarded).toBe(2);
  });
});

describe('module-wiring.diffManifests', () => {
  it('newly registered', () => {
    const out = diffManifests({
      before: ['risk-policy-engine'],
      after: [
        baseEntry(),
        baseEntry({ name: 'login-risk-anomaly', registered: true }),
      ],
    });
    expect(out).toEqual(['login-risk-anomaly']);
  });
});

describe('module-wiring.patchEntry', () => {
  it('patches', () => {
    const out = patchEntry({
      current: baseEntry(),
      patch: { guarded: false },
    });
    expect(out.guarded).toBe(false);
    expect(out.name).toBe('risk-policy-engine');
  });
  it('cannot rename', () => {
    const out = patchEntry({
      current: baseEntry(),
      patch: { name: 'login-risk-anomaly' as IModuleEntry['name'] },
    });
    expect(out.name).toBe('risk-policy-engine');
  });
});
