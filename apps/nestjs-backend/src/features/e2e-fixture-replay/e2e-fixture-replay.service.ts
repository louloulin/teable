/**
 * E2E fixture replay — pure helpers (Stage 100).
 */

import {
  validateFixture,
} from '../e2e-test-utils/e2e-test-utils.service';
import type {
  IFixtureReplaySession,
  IReplayRequest,
  IReplayStep,
  IReplaySummary,
  ReplayStatus,
} from './e2e-fixture-replay.types';
import type { ITestUser } from '../e2e-test-utils/e2e-test-utils.types';
import { MAX_REPLAY_STEPS } from './e2e-fixture-replay.types';

/** Derive a stable session id from the replay seed. */
export function deriveSessionId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (h * 33) ^ seed.charCodeAt(i);
  return `replay-${(h >>> 0).toString(36)}`;
}

/** Build the canonical replay step list from a fixture (deterministic order). */
export function planReplaySteps(input: { fixtureId: string }): IReplayStep[] {
  // Steps are intentionally ordered: org → users → tokens.
  return [
    { id: `${input.fixtureId}-org`, op: 'createOrg', passed: false },
    { id: `${input.fixtureId}-users`, op: 'createUser', passed: false },
    { id: `${input.fixtureId}-tokens`, op: 'mintToken', passed: false },
  ];
}

/** Validate a replay request — wraps fixture validation. */
export function validateReplayRequest(req: IReplayRequest): string | null {
  if (!req.fixture) return 'fixture required';
  return validateFixture(req.fixture);
}

/** Initial session — status pending. */
export function startSession(input: { req: IReplayRequest }): IFixtureReplaySession {
  const err = validateReplayRequest(input.req);
  if (err) throw new Error(`invalid replay request: ${err}`);
  const seed = input.req.seed ?? input.req.fixture.seed;
  const id = deriveSessionId(`${seed}-${Date.now().toString(36)}`);
  const steps = planReplaySteps({ fixtureId: id });
  return {
    id,
    fixture: input.req.fixture,
    steps,
    status: 'pending',
    startedAt: new Date().toISOString(),
    replaySeed: seed,
  };
}

/** Mark session as replaying. */
export function markReplaying(s: IFixtureReplaySession): IFixtureReplaySession {
  if (s.status !== 'pending') throw new Error(`cannot start: ${s.status}`);
  return { ...s, status: 'replaying' };
}

/** Apply a step result to the session. */
export function applyStepResult(input: {
  session: IFixtureReplaySession;
  stepId: string;
  passed: boolean;
  error?: string;
}): IFixtureReplaySession {
  if (input.session.status !== 'replaying') {
    throw new Error(`cannot apply step: ${input.session.status}`);
  }
  const steps = input.session.steps.map((s) =>
    s.id === input.stepId
      ? { ...s, passed: input.passed, error: input.error }
      : s
  );
  return { ...input.session, steps };
}

/** Finalize session. */
export function finalize(input: {
  session: IFixtureReplaySession;
  ok: boolean;
}): IFixtureReplaySession {
  const status: ReplayStatus = input.ok ? 'done' : 'failed';
  return {
    ...input.session,
    status,
    finishedAt: new Date().toISOString(),
  };
}

/** Compute summary from a finished session. */
export function summarize(s: IFixtureReplaySession): IReplaySummary {
  const total = s.steps.length;
  const passed = s.steps.filter((x) => x.passed).length;
  const failed = total - passed;
  const durationMs =
    s.finishedAt && s.startedAt
      ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()
      : 0;
  return { total, passed, failed, durationMs };
}

/** Whether the session reached a terminal status. */
export function isTerminal(s: IFixtureReplaySession): boolean {
  return s.status === 'done' || s.status === 'failed';
}

/** Cap steps to the maximum. */
export function capSteps(s: IFixtureReplaySession): IFixtureReplaySession {
  if (s.steps.length <= MAX_REPLAY_STEPS) return s;
  return { ...s, steps: s.steps.slice(0, MAX_REPLAY_STEPS) };
}

/** Find a step by id. */
export function findStep(
  s: IFixtureReplaySession,
  stepId: string
): IReplayStep | null {
  return s.steps.find((x) => x.id === stepId) ?? null;
}

/** Filter steps by op. */
export function stepsByOp(s: IFixtureReplaySession, op: string): IReplayStep[] {
  return s.steps.filter((x) => x.op === op);
}

/** Whether the replay fully passed. */
export function allPassed(s: IFixtureReplaySession): boolean {
  return s.steps.every((x) => x.passed);
}

/** Count of replayed users (stable value derived from fixture). */
export function userCount(s: IFixtureReplaySession): number {
  return s.fixture.users.length;
}

/** Whether a token exists for a user. */
export function hasToken(s: IFixtureReplaySession, userId: string): boolean {
  return Boolean(s.fixture.tokens[userId]);
}

/** Lookup a user in the session fixture. */
export function findUser(
  s: IFixtureReplaySession,
  userId: string
): ITestUser | null {
  return s.fixture.users.find((u) => u.id === userId) ?? null;
}
