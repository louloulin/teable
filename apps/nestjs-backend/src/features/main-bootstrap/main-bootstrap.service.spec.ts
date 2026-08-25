/**
 * Main bootstrap — pure helpers spec (Stage 97).
 */

import {
  applyShutdown,
  buildPlan,
  defaultPlan,
  isStopped,
  isStepCompleted,
  isValidTransition,
  recordShutdown,
  requiredStepCount,
  transition,
  validateBootstrapInput,
} from './main-bootstrap.service';
import type { IBootstrapInput } from './main-bootstrap.types';

const baseInput = (over: Partial<IBootstrapInput> = {}): IBootstrapInput => ({
  appName: 'app',
  version: '1.0.0',
  port: 3000,
  shutdownTimeoutMs: 10_000,
  ...over,
});

describe('main-bootstrap.validateBootstrapInput', () => {
  it('passes', () => {
    expect(validateBootstrapInput(baseInput())).toBeNull();
  });
  it('rejects missing appName', () => {
    expect(validateBootstrapInput(baseInput({ appName: '' }))).toContain('appName');
  });
  it('rejects bad port', () => {
    expect(validateBootstrapInput(baseInput({ port: 0 }))).toContain('port');
  });
  it('rejects low timeout', () => {
    expect(validateBootstrapInput(baseInput({ shutdownTimeoutMs: 0 }))).toContain('shutdownTimeoutMs');
  });
});

describe('main-bootstrap.buildPlan', () => {
  it('builds', () => {
    const p = buildPlan({ config: baseInput(), steps: [{ name: 'x', required: true }] });
    expect(p.state).toBe('init');
  });
  it('throws on invalid', () => {
    expect(() => buildPlan({ config: baseInput({ port: 0 }), steps: [] })).toThrow();
  });
});

describe('main-bootstrap.transition', () => {
  it('init -> starting', () => {
    const p = buildPlan({ config: baseInput(), steps: [] });
    const next = transition({ plan: p, to: 'starting' });
    expect(next.state).toBe('starting');
  });
  it('rejects init -> ready', () => {
    const p = buildPlan({ config: baseInput(), steps: [] });
    expect(() => transition({ plan: p, to: 'ready' })).toThrow();
  });
});

describe('main-bootstrap.isValidTransition', () => {
  it('valid', () => {
    expect(isValidTransition('init', 'starting')).toBe(true);
    expect(isValidTransition('ready', 'shutting_down')).toBe(true);
  });
  it('invalid', () => {
    expect(isValidTransition('stopped', 'ready')).toBe(false);
  });
});

describe('main-bootstrap.defaultPlan', () => {
  it('returns sensible defaults', () => {
    const p = defaultPlan({});
    expect(p.port).toBe(3000);
    expect(p.state).toBe('init');
  });
});

describe('main-bootstrap.recordShutdown', () => {
  it('records', () => {
    const s = recordShutdown({ signal: 'SIGTERM', now: '2026-08-25T00:00:00Z' });
    expect(s.signal).toBe('SIGTERM');
  });
});

describe('main-bootstrap.requiredStepCount', () => {
  it('counts', () => {
    const p = buildPlan({
      config: baseInput(),
      steps: [
        { name: 'a', required: true },
        { name: 'b', required: false },
        { name: 'c', required: true },
      ],
    });
    expect(requiredStepCount(p)).toBe(2);
  });
});

describe('main-bootstrap.isStopped', () => {
  it('true', () => {
    expect(isStopped('stopped')).toBe(true);
    expect(isStopped('errored')).toBe(true);
  });
  it('false', () => {
    expect(isStopped('ready')).toBe(false);
  });
});

describe('main-bootstrap.applyShutdown', () => {
  it('transitions to shutting_down', () => {
    const p = transition({
      plan: buildPlan({ config: baseInput(), steps: [] }),
      to: 'starting',
    });
    const ready = transition({ plan: p, to: 'ready' });
    const s = applyShutdown({ plan: ready, signal: recordShutdown({ signal: 'SIGTERM', now: 'x' }) });
    expect(s.state).toBe('shutting_down');
  });
});

describe('main-bootstrap.isStepCompleted', () => {
  it('true', () => {
    expect(isStepCompleted({ steps: [{ name: 'a', required: true }], name: 'a' })).toBe(true);
  });
  it('false', () => {
    expect(isStepCompleted({ steps: [], name: 'a' })).toBe(false);
  });
});