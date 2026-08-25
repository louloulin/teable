/**
 * Env config — pure helpers spec (Stage 96).
 */

import {
  banner,
  boolEnv,
  numberEnv,
  optional,
  required,
  resolveAll,
  resolveOne,
  validateEnvSpec,
} from './env-config.service';
import type { IEnvSpec } from './env-config.types';

const baseSpec = (over: Partial<IEnvSpec> = {}): IEnvSpec => ({
  name: 'TEST_VAR',
  required: true,
  kind: 'string',
  ...over,
});

describe('env-config.validateEnvSpec', () => {
  it('passes', () => {
    expect(validateEnvSpec(baseSpec())).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateEnvSpec(baseSpec({ name: '' }))).toContain('name');
  });
  it('rejects unknown kind', () => {
    expect(validateEnvSpec(baseSpec({ kind: 'wat' as never }))).toContain('kind');
  });
  it('rejects enum without values', () => {
    expect(validateEnvSpec(baseSpec({ kind: 'enum' }))).toContain('enumValues');
  });
});

describe('env-config.resolveOne', () => {
  it('required unset', () => {
    const r = resolveOne(baseSpec(), {});
    expect(r.issue).toContain('required');
  });
  it('required set', () => {
    const r = resolveOne(baseSpec(), { TEST_VAR: 'ok' });
    expect(r.issue).toBeNull();
    expect(r.value).toBe('ok');
  });
  it('number', () => {
    const r = resolveOne(baseSpec({ kind: 'number' }), { TEST_VAR: '42' });
    expect(r.value).toBe(42);
  });
  it('boolean true', () => {
    const r = resolveOne(baseSpec({ kind: 'boolean' }), { TEST_VAR: 'true' });
    expect(r.value).toBe(true);
  });
  it('boolean false', () => {
    const r = resolveOne(baseSpec({ kind: 'boolean' }), { TEST_VAR: '0' });
    expect(r.value).toBe(false);
  });
  it('default used', () => {
    const r = resolveOne(
      baseSpec({ required: false, default: 'fallback' }),
      {}
    );
    expect(r.value).toBe('fallback');
  });
  it('oversize value', () => {
    const r = resolveOne(baseSpec(), { TEST_VAR: 'x'.repeat(MAX_LEN) });
    expect(r.issue).toContain('too long');
  });
});

const MAX_LEN = 5000;

describe('env-config.resolveAll', () => {
  it('valid', () => {
    const r = resolveAll({
      specs: [
        baseSpec({ name: 'A' }),
        baseSpec({ name: 'B', kind: 'number', required: false, default: 10 }),
      ],
      env: { A: 'ok' },
    });
    expect(r.valid).toBe(true);
    expect(r.values['B']).toBe(10);
  });
  it('invalid', () => {
    const r = resolveAll({
      specs: [baseSpec({ name: 'A' })],
      env: {},
    });
    expect(r.valid).toBe(false);
  });
});

describe('env-config.required', () => {
  it('present', () => {
    expect(required({ name: 'A', env: { A: 'x' } })).toBe('x');
  });
  it('throws when missing', () => {
    expect(() => required({ name: 'A', env: {} })).toThrow();
  });
});

describe('env-config.optional', () => {
  it('present', () => {
    expect(optional({ name: 'A', env: { A: 'x' }, fallback: 'y' })).toBe('x');
  });
  it('uses fallback', () => {
    expect(optional({ name: 'A', env: {}, fallback: 'y' })).toBe('y');
  });
});

describe('env-config.boolEnv', () => {
  it('true', () => {
    expect(boolEnv({ name: 'A', env: { A: 'true' } })).toBe(true);
  });
  it('1', () => {
    expect(boolEnv({ name: 'A', env: { A: '1' } })).toBe(true);
  });
  it('fallback', () => {
    expect(boolEnv({ name: 'A', env: {}, fallback: true })).toBe(true);
  });
});

describe('env-config.numberEnv', () => {
  it('valid', () => {
    expect(numberEnv({ name: 'A', env: { A: '5' }, fallback: 0 })).toBe(5);
  });
  it('fallback', () => {
    expect(numberEnv({ name: 'A', env: {}, fallback: 7 })).toBe(7);
  });
  it('throws on NaN', () => {
    expect(() => numberEnv({ name: 'A', env: { A: 'x' }, fallback: 0 })).toThrow();
  });
});

describe('env-config.banner', () => {
  it('renders valid', () => {
    const r = resolveAll({ specs: [baseSpec({ name: 'A', required: false, default: 'x' })], env: {} });
    const b = banner(r);
    expect(b).toContain('valid');
    expect(b).toContain('A=x');
  });
});