/**
 * E2E test utils — types (Stage 94).
 */

export interface ITestUser {
  id: string;
  email: string;
  roles: string[];
}

export interface ITestOrg {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface ITestFixture {
  org: ITestOrg;
  users: ITestUser[];
  /** Tokens already minted for each user — keys are user ids. */
  tokens: Record<string, string>;
  /** Stable seed for replay. */
  seed: string;
}

export interface IApiCallInput {
  verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** Headers to include; auth token merged automatically. */
  headers?: Record<string, string>;
  body?: unknown;
}

export interface IApiCallResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface IAssertionInput {
  actual: unknown;
  expected: unknown;
  /** "equal" | "contains" | "matches" — semantic comparator. */
  kind: 'equal' | 'contains' | 'matches';
}

export interface IAssertionResult {
  passed: boolean;
  detail: string;
}

export const MAX_USERS_PER_FIXTURE = 64;
export const MAX_FIXTURES = 256;
export const MAX_HEADER_COUNT = 32;