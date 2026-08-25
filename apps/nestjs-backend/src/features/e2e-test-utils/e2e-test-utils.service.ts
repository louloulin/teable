/**
 * E2E test utils — pure helpers (Stage 94).
 */

import type {
  IApiCallInput,
  IApiCallResult,
  IAssertionInput,
  IAssertionResult,
  ITestFixture,
  ITestOrg,
  ITestUser,
} from './e2e-test-utils.types';
import {
  MAX_HEADER_COUNT,
  MAX_USERS_PER_FIXTURE,
} from './e2e-test-utils.types';

const VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PLANS = new Set(['free', 'pro', 'enterprise']);

function stringify(v: unknown): string {
  return JSON.stringify(v);
}

/** Validate a fixture. */
export function validateFixture(f: ITestFixture): string | null {
  if (!f.org) return 'org required';
  const err = validateOrg(f.org);
  if (err) return `org: ${err}`;
  if (!Array.isArray(f.users)) return 'users must be an array';
  if (f.users.length > MAX_USERS_PER_FIXTURE) return `users cap ${MAX_USERS_PER_FIXTURE}`;
  const ids = new Set<string>();
  for (const u of f.users) {
    if (ids.has(u.id)) return `duplicate user id: ${u.id}`;
    ids.add(u.id);
    if (!u.email || !u.email.includes('@')) return `user ${u.id}: bad email`;
    if (!Array.isArray(u.roles)) return `user ${u.id}: roles must be array`;
  }
  for (const uid of Object.keys(f.tokens)) {
    if (!ids.has(uid)) return `token for unknown user: ${uid}`;
  }
  return null;
}

/** Validate an org. */
export function validateOrg(o: ITestOrg): string | null {
  if (!o.id) return 'id required';
  if (!o.name) return 'name required';
  if (!PLANS.has(o.plan)) return `unknown plan: ${o.plan}`;
  return null;
}

/** Validate an API call input. */
export function validateCall(c: IApiCallInput): string | null {
  if (!VERBS.has(c.verb)) return `bad verb: ${c.verb}`;
  if (!c.path || !c.path.startsWith('/')) return 'path must start with /';
  if (c.headers && Object.keys(c.headers).length > MAX_HEADER_COUNT) {
    return `headers cap ${MAX_HEADER_COUNT}`;
  }
  return null;
}

/** Compose headers (auth + caller headers). */
export function composeHeaders(input: {
  token: string | null;
  caller?: Record<string, string>;
}): Record<string, string> {
  const out: Record<string, string> = { ...(input.caller ?? {}) };
  if (input.token) out['authorization'] = `Bearer ${input.token}`;
  return out;
}

/** Build a canonical API call from input. */
export function buildCall(input: {
  verb: IApiCallInput['verb'];
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}): IApiCallInput {
  const err = validateCall({ verb: input.verb, path: input.path, body: input.body, headers: input.headers });
  if (err) throw new Error(err);
  return {
    verb: input.verb,
    path: input.path,
    body: input.body,
    headers: input.headers,
  };
}

/** Run an assertion. */
export function runAssertion(a: IAssertionInput): IAssertionResult {
  switch (a.kind) {
    case 'equal':
      return {
        passed: deepEqual(a.actual, a.expected),
        detail: `equal(${stringify(a.actual)}, ${stringify(a.expected)})`,
      };
    case 'contains': {
      const actualStr = stringify(a.actual);
      const expectedStr = stringify(a.expected);
      return {
        passed: actualStr.includes(expectedStr),
        detail: `contains(${actualStr}, ${expectedStr})`,
      };
    }
    case 'matches': {
      const actualStr = stringify(a.actual);
      const pattern = new RegExp(String(a.expected));
      return {
        passed: pattern.test(actualStr),
        detail: `matches(${actualStr}, ${pattern})`,
      };
    }
    default:
      return { passed: false, detail: 'unknown assertion kind' };
  }
}

/** Deep equality (JSON-style). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
    }
    for (const k of ak) {
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/** Synthesize an empty result for tests that just want to assert structure. */
export function emptyResult(status: number): IApiCallResult {
  return {
    status,
    body: null,
    headers: {},
    durationMs: 0,
  };
}

/** Find a user in a fixture by id. */
export function findUser(f: ITestFixture, userId: string): ITestUser | null {
  return f.users.find((u) => u.id === userId) ?? null;
}

/** Token for a user — null when missing. */
export function tokenFor(f: ITestFixture, userId: string): string | null {
  return f.tokens[userId] ?? null;
}