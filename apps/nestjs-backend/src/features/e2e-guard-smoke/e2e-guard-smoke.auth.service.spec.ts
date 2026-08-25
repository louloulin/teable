/**
 * E2E guard smoke — NestJS auth service spec (Stage 102).
 */

import { E2eGuardSmokeAuthService } from './e2e-guard-smoke.auth.service';
import type { IGuardSmokeExecutor } from './e2e-guard-smoke.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(): IPrismaMock {
  return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
}

describe('E2eGuardSmokeAuthService.canonical / smoke', () => {
  it('canonical + smoke', async () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    const cases = svc.buildCanonicalCases({ fixtureId: 'fx' });
    expect(cases.length).toBe(4);
    const report = await svc.smoke({ cases });
    expect(report.passed).toBe(4);
  });

  it('smoke with executor', async () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    const cases = svc.buildCanonicalCases({ fixtureId: 'fx' });
    const executor: IGuardSmokeExecutor = {
      execute: async () => ({ allowed: true, traceId: 't', status: 200 }),
    };
    const report = await svc.smoke({ cases, executor });
    expect(report.passed).toBe(4);
    expect(report.results[0].traceId).toBe('t');
  });
});

describe('E2eGuardSmokeAuthService.failures / passRate / cap', () => {
  it('passRate', () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    const report = {
      total: 4,
      passed: 3,
      failed: 1,
      durationMs: 0,
      results: [],
    };
    expect(svc.passRate(report)).toBeCloseTo(0.75);
    expect(svc.failures(report).length).toBe(0);
  });
  it('cap', () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    const cases = svc.buildCanonicalCases({ fixtureId: 'fx' });
    const capped = svc.cap(cases);
    expect(capped.length).toBe(4);
  });
});

describe('E2eGuardSmokeAuthService.envelope / statusFor', () => {
  it('envelope', () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    const env = svc.envelope({
      case: {
        id: 'a',
        description: 'x',
        ctx: { principal: 'u', roles: ['admin'], action: 'read' },
        expected: 'allowed',
      },
      traceId: 't',
    });
    expect(env.traceId).toBe('t');
  });
  it('statusFor', () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    expect(svc.statusFor({ outcome: 'allowed', principal: 'u' })).toBe(200);
    expect(svc.statusFor({ outcome: 'denied', principal: null })).toBe(401);
  });
});

describe('E2eGuardSmokeAuthService.ping', () => {
  it('true', async () => {
    const svc = new E2eGuardSmokeAuthService(makePrisma() as never);
    expect(await svc.ping()).toBe(true);
  });
});
