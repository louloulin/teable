/**
 * E2E fixture replay — types (Stage 100).
 */

import type { ITestFixture, ITestUser } from '../e2e-test-utils/e2e-test-utils.types';

export type { ITestFixture, ITestUser } from '../e2e-test-utils/e2e-test-utils.types';

export type ReplayStatus = 'pending' | 'replaying' | 'done' | 'failed';

export interface IReplayStep {
  /** Stable step id. */
  id: string;
  /** Logical operation: 'createUser', 'createOrg', 'mintToken'. */
  op: string;
  /** Whether this step succeeded during replay. */
  passed: boolean;
  /** Optional error message when failed. */
  error?: string;
}

export interface IFixtureReplaySession {
  id: string;
  fixture: ITestFixture;
  steps: IReplayStep[];
  status: ReplayStatus;
  startedAt: string;
  finishedAt?: string;
  /** Stable seed used to derive ids / tokens during replay. */
  replaySeed: string;
}

export interface IReplaySummary {
  total: number;
  passed: number;
  failed: number;
  /** Wall-clock duration in ms (0 when not finished). */
  durationMs: number;
}

export interface IReplayRequest {
  fixture: ITestFixture;
  /** Optional seed override; default = fixture.seed. */
  seed?: string;
}

export const MAX_REPLAY_STEPS = 256;
export const MAX_REPLAY_SESSIONS = 64;
