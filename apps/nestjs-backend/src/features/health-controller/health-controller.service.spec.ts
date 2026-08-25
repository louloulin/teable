/**
 * Health controller — pure helpers spec (Stage 98).
 */

import {
  aggregateState,
  buildSnapshot,
  checkCount,
  failures,
  isLive,
  isReady,
  passRate,
  statusForState,
  syntheticCheck,
  validateCheck,
} from './health-controller.service';

const baseCheck = (over: Partial<ICheckResult> = {}): ICheckResult => ({
  name: 'prisma',
  ok: true,
  durationMs: 5,
  ...over,
});

import type { ICheckResult } from './health-controller.types';

describe('health-controller.validateCheck', () => {
  it('passes', () => {
    expect(validateCheck(baseCheck())).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateCheck(baseCheck({ name: '' }))).toContain('name');
  });
  it('rejects negative duration', () => {
    expect(validateCheck(baseCheck({ durationMs: -1 }))).toContain('durationMs');
  });
});

describe('health-controller.aggregateState', () => {
  it('all ok → healthy', () => {
    expect(aggregateState([baseCheck(), baseCheck({ name: 'x' })])).toBe('healthy');
  });
  it('all fail → unhealthy', () => {
    expect(aggregateState([baseCheck({ ok: false }), baseCheck({ name: 'x', ok: false })])).toBe(
      'unhealthy'
    );
  });
  it('partial → degraded', () => {
    expect(aggregateState([baseCheck(), baseCheck({ name: 'x', ok: false })])).toBe('degraded');
  });
  it('empty → healthy', () => {
    expect(aggregateState([])).toBe('healthy');
  });
});

describe('health-controller.buildSnapshot', () => {
  it('builds', () => {
    const s = buildSnapshot({
      appName: 'x',
      version: '1',
      checks: [baseCheck()],
      uptimeMs: 100,
      now: '2026-08-25T00:00:00Z',
    });
    expect(s.state).toBe('healthy');
  });
  it('throws on invalid', () => {
    expect(() =>
      buildSnapshot({
        appName: 'x',
        version: '1',
        checks: [baseCheck({ name: '' })],
        uptimeMs: 100,
        now: 'x',
      })
    ).toThrow();
  });
});

describe('health-controller.statusForState', () => {
  it('maps', () => {
    expect(statusForState('healthy')).toBe(200);
    expect(statusForState('degraded')).toBe(200);
    expect(statusForState('unhealthy')).toBe(503);
  });
});

describe('health-controller.isLive / isReady', () => {
  it('healthy', () => {
    const s = buildSnapshot({ appName: 'x', version: '1', checks: [], uptimeMs: 0, now: 'x' });
    expect(isLive(s)).toBe(true);
    expect(isReady(s)).toBe(true);
  });
  it('unhealthy', () => {
    const s = buildSnapshot({
      appName: 'x',
      version: '1',
      checks: [baseCheck({ ok: false })],
      uptimeMs: 0,
      now: 'x',
    });
    expect(isLive(s)).toBe(false);
    expect(isReady(s)).toBe(false);
  });
});

describe('health-controller.failures', () => {
  it('only failing', () => {
    const s = buildSnapshot({
      appName: 'x',
      version: '1',
      checks: [baseCheck(), baseCheck({ name: 'x', ok: false })],
      uptimeMs: 0,
      now: 'x',
    });
    expect(failures(s).length).toBe(1);
  });
});

describe('health-controller.checkCount / passRate', () => {
  it('counts', () => {
    const s = buildSnapshot({
      appName: 'x',
      version: '1',
      checks: [baseCheck(), baseCheck({ name: 'x', ok: false })],
      uptimeMs: 0,
      now: 'x',
    });
    expect(checkCount(s)).toBe(2);
    expect(passRate(s)).toBe(0.5);
  });
  it('empty → 1', () => {
    const s = buildSnapshot({ appName: 'x', version: '1', checks: [], uptimeMs: 0, now: 'x' });
    expect(passRate(s)).toBe(1);
  });
});

describe('health-controller.syntheticCheck', () => {
  it('shape', () => {
    expect(syntheticCheck('x').ok).toBe(true);
  });
});