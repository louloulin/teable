/**
 * E2E test utils — pure helpers spec (Stage 94).
 */

import {
  buildCall,
  composeHeaders,
  deepEqual,
  emptyResult,
  findUser,
  runAssertion,
  tokenFor,
  validateCall,
  validateFixture,
  validateOrg,
} from './e2e-test-utils.service';
import type { ITestFixture } from './e2e-test-utils.types';

const baseFixture = (over: Partial<ITestFixture> = {}): ITestFixture => ({
  org: { id: 'org-1', name: 'Acme', plan: 'pro' },
  users: [
    { id: 'u-1', email: 'a@b.com', roles: ['admin'] },
    { id: 'u-2', email: 'c@d.com', roles: ['member'] },
  ],
  tokens: { 'u-1': 'tok-1', 'u-2': 'tok-2' },
  seed: 'seed-1',
  ...over,
});

describe('e2e-test-utils.validateOrg', () => {
  it('passes', () => {
    expect(validateOrg({ id: '1', name: 'x', plan: 'free' })).toBeNull();
  });
  it('rejects bad plan', () => {
    expect(validateOrg({ id: '1', name: 'x', plan: 'wat' as never })).toContain('plan');
  });
});

describe('e2e-test-utils.validateFixture', () => {
  it('passes', () => {
    expect(validateFixture(baseFixture())).toBeNull();
  });
  it('rejects duplicate user', () => {
    expect(
      validateFixture(
        baseFixture({
          users: [
            { id: 'u-1', email: 'a@b.com', roles: ['admin'] },
            { id: 'u-1', email: 'c@d.com', roles: ['member'] },
          ],
        })
      )
    ).toContain('duplicate');
  });
  it('rejects bad email', () => {
    expect(
      validateFixture(
        baseFixture({
          users: [{ id: 'u-1', email: 'no-at', roles: [] }],
        })
      )
    ).toContain('email');
  });
});

describe('e2e-test-utils.validateCall', () => {
  it('passes', () => {
    expect(validateCall({ verb: 'GET', path: '/api/x' })).toBeNull();
  });
  it('rejects bad verb', () => {
    expect(validateCall({ verb: 'WAT' as never, path: '/api/x' })).toContain('verb');
  });
  it('rejects path without slash', () => {
    expect(validateCall({ verb: 'GET', path: 'x' })).toContain('/');
  });
});

describe('e2e-test-utils.composeHeaders', () => {
  it('with token', () => {
    const h = composeHeaders({ token: 'tok-1', caller: { 'x-foo': 'bar' } });
    expect(h['authorization']).toBe('Bearer tok-1');
    expect(h['x-foo']).toBe('bar');
  });
  it('without token', () => {
    const h = composeHeaders({ token: null });
    expect(h['authorization']).toBeUndefined();
  });
});

describe('e2e-test-utils.buildCall', () => {
  it('builds', () => {
    const c = buildCall({ verb: 'POST', path: '/api/x', body: { a: 1 } });
    expect(c.verb).toBe('POST');
  });
  it('throws on bad input', () => {
    expect(() => buildCall({ verb: 'POST', path: 'bad' })).toThrow();
  });
});

describe('e2e-test-utils.runAssertion', () => {
  it('equal', () => {
    expect(runAssertion({ actual: { a: 1 }, expected: { a: 1 }, kind: 'equal' }).passed).toBe(true);
  });
  it('contains', () => {
    expect(runAssertion({ actual: 'hello', expected: 'hello', kind: 'contains' }).passed).toBe(true);
  });
  it('matches', () => {
    expect(runAssertion({ actual: 'trace-abc', expected: 'trace', kind: 'matches' }).passed).toBe(true);
  });
});

describe('e2e-test-utils.deepEqual', () => {
  it('nested', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });
  it('mismatch', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('e2e-test-utils.emptyResult', () => {
  it('shape', () => {
    expect(emptyResult(200).status).toBe(200);
  });
});

describe('e2e-test-utils.findUser', () => {
  it('found', () => {
    expect(findUser(baseFixture(), 'u-1')?.email).toBe('a@b.com');
  });
  it('null', () => {
    expect(findUser(baseFixture(), 'nope')).toBeNull();
  });
});

describe('e2e-test-utils.tokenFor', () => {
  it('present', () => {
    expect(tokenFor(baseFixture(), 'u-1')).toBe('tok-1');
  });
  it('null', () => {
    expect(tokenFor(baseFixture(), 'nope')).toBeNull();
  });
});