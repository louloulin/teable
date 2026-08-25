/**
 * E2E fixture replay — NestJS auth service spec (Stage 100).
 */

import { E2eFixtureReplayAuthService } from './e2e-fixture-replay.auth.service';
import type { ITestFixture } from '../e2e-test-utils/e2e-test-utils.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

function fixture(): ITestFixture {
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

describe('E2eFixtureReplayAuthService.begin / start / finish', () => {
  it('round trip', () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    const session = svc.begin({ req: { fixture: fixture() } });
    expect(session.status).toBe('pending');
    const started = svc.start(session.id);
    expect(started?.status).toBe('replaying');
    const stepId = started!.steps[0].id;
    const recorded = svc.recordStep({
      id: session.id,
      stepId,
      passed: true,
    });
    expect(recorded?.steps[0].passed).toBe(true);
    const finished = svc.finish({ id: session.id, ok: true });
    expect(finished?.status).toBe('done');
    expect(svc.isDone(session.id)).toBe(true);
  });

  it('summary', () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    const session = svc.begin({ req: { fixture: fixture() } });
    svc.start(session.id);
    svc.finish({ id: session.id, ok: false });
    const sum = svc.summary(session.id);
    expect(sum?.total).toBe(3);
    expect(sum?.failed).toBe(3);
  });

  it('get returns null for unknown', () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    expect(svc.get('nope')).toBeNull();
  });

  it('listIds', () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    const fx1 = fixture();
    fx1.seed = 'seed-A';
    const fx2 = fixture();
    fx2.seed = 'seed-B';
    svc.begin({ req: { fixture: fx1 } });
    svc.begin({ req: { fixture: fx2 } });
    expect(svc.listIds().length).toBe(2);
  });
});

describe('E2eFixtureReplayAuthService.plan', () => {
  it('plans', () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    const steps = svc.plan({ fixtureId: 'fx' });
    expect(steps.length).toBe(3);
  });
});

describe('E2eFixtureReplayAuthService.ping', () => {
  it('true', async () => {
    const svc = new E2eFixtureReplayAuthService(makePrisma() as never);
    expect(await svc.ping()).toBe(true);
  });
});
