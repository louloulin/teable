/**
 * E2E fixture replay — pure helpers spec (Stage 100).
 */

import {
  allPassed,
  applyStepResult,
  capSteps,
  deriveSessionId,
  findStep,
  findUser,
  finalize,
  hasToken,
  isTerminal,
  markReplaying,
  planReplaySteps,
  startSession,
  stepsByOp,
  summarize,
  userCount,
  validateReplayRequest,
} from './e2e-fixture-replay.service';
import type { IFixtureReplaySession, ITestFixture } from './e2e-fixture-replay.types';
import type { ITestFixture as IFixtureFromE2E } from '../e2e-test-utils/e2e-test-utils.types';

function fixture(): IFixtureFromE2E {
  return {
    org: { id: 'org1', name: 'Acme', plan: 'pro' },
    users: [
      { id: 'u1', email: 'u1@a.com', roles: ['admin'] },
      { id: 'u2', email: 'u2@a.com', roles: ['viewer'] },
    ],
    tokens: { u1: 'tok-u1', u2: 'tok-u2' },
    seed: 'seed-1',
  };
}

describe('e2e-fixture-replay.deriveSessionId', () => {
  it('stable for same seed', () => {
    expect(deriveSessionId('abc')).toBe(deriveSessionId('abc'));
  });
  it('differs across seeds', () => {
    expect(deriveSessionId('abc')).not.toBe(deriveSessionId('xyz'));
  });
  it('prefix', () => {
    expect(deriveSessionId('abc')).toMatch(/^replay-/);
  });
});

describe('e2e-fixture-replay.planReplaySteps', () => {
  it('three steps in order', () => {
    const steps = planReplaySteps({ fixtureId: 'fx' });
    expect(steps.map((s) => s.op)).toEqual(['createOrg', 'createUser', 'mintToken']);
    expect(steps.every((s) => s.passed === false)).toBe(true);
  });
});

describe('e2e-fixture-replay.validateReplayRequest', () => {
  it('passes', () => {
    expect(validateReplayRequest({ fixture: fixture() })).toBeNull();
  });
  it('rejects missing fixture', () => {
    expect(validateReplayRequest({} as never)).toContain('fixture');
  });
  it('rejects bad fixture', () => {
    const bad = fixture();
    bad.users[0].email = 'bad';
    expect(validateReplayRequest({ fixture: bad })).toBeTruthy();
  });
});

describe('e2e-fixture-replay.startSession', () => {
  it('pending', () => {
    const s = startSession({ req: { fixture: fixture() } });
    expect(s.status).toBe('pending');
    expect(s.steps.length).toBe(3);
    expect(s.replaySeed).toBe('seed-1');
  });
  it('throws on invalid', () => {
    expect(() => startSession({ req: { fixture: {} as never } })).toThrow();
  });
});

describe('e2e-fixture-replay.markReplaying / finalize', () => {
  it('transitions', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    const s1 = markReplaying(s0);
    expect(s1.status).toBe('replaying');
    const s2 = finalize({ session: s1, ok: true });
    expect(s2.status).toBe('done');
    expect(isTerminal(s2)).toBe(true);
  });
  it('cannot start from done', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    const s1 = finalize({ session: s0, ok: false });
    expect(() => markReplaying(s1)).toThrow();
  });
});

describe('e2e-fixture-replay.applyStepResult', () => {
  it('updates step', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    const s1 = markReplaying(s0);
    const stepId = s1.steps[0].id;
    const s2 = applyStepResult({ session: s1, stepId, passed: true });
    expect(findStep(s2, stepId)?.passed).toBe(true);
  });
  it('rejects when not replaying', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    expect(() => applyStepResult({ session: s0, stepId: 'x', passed: true })).toThrow();
  });
});

describe('e2e-fixture-replay.summarize / allPassed', () => {
  it('all passed', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    const s1 = markReplaying(s0);
    const s2 = s1.steps.reduce(
      (acc, st) => applyStepResult({ session: acc, stepId: st.id, passed: true }),
      s1
    );
    const s3 = finalize({ session: s2, ok: true });
    const sum = summarize(s3);
    expect(sum.total).toBe(3);
    expect(sum.passed).toBe(3);
    expect(sum.failed).toBe(0);
    expect(allPassed(s3)).toBe(true);
  });
  it('partial', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    const s1 = markReplaying(s0);
    const s2 = applyStepResult({ session: s1, stepId: s1.steps[0].id, passed: true });
    const s3 = finalize({ session: s2, ok: false });
    const sum = summarize(s3);
    expect(sum.passed).toBe(1);
    expect(sum.failed).toBe(2);
  });
});

describe('e2e-fixture-replay.capSteps / stepsByOp / queries', () => {
  it('capSteps passes when under', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    expect(capSteps(s0)).toBe(s0);
  });
  it('stepsByOp', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    expect(stepsByOp(s0, 'createUser').length).toBe(1);
  });
  it('user / token', () => {
    const s0 = startSession({ req: { fixture: fixture() } });
    expect(userCount(s0)).toBe(2);
    expect(hasToken(s0, 'u1')).toBe(true);
    expect(hasToken(s0, 'uX')).toBe(false);
    expect(findUser(s0, 'u2')?.email).toBe('u2@a.com');
    expect(findUser(s0, 'nope')).toBeNull();
  });
});
