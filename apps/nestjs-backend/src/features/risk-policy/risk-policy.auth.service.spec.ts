/**
 * Risk policy NestJS auth service — persistence is mocked.
 */

import { RiskPolicyAuthService } from './risk-policy.auth.service';
import type { IRiskPolicy, IRiskSignal } from './risk-policy.types';

interface IPrismaMock {
  riskPolicy: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  riskDecision: {
    upsert: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    riskPolicy: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    riskDecision: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const basePolicy = (over: Partial<IRiskPolicy> = {}): IRiskPolicy => ({
  id: 'p1',
  orgId: 'o1',
  defaultAction: 'allow',
  rules: [],
  auditAll: true,
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseSignal = (over: Partial<IRiskSignal> = {}): IRiskSignal => ({
  kind: 'login.new-device',
  weight: 10,
  detail: 'unknown',
  occurredAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('RiskPolicyAuthService.validatePolicy', () => {
  it('passes healthy', () => {
    const svc = new RiskPolicyAuthService(makePrisma() as never);
    expect(svc.validatePolicy(basePolicy())).toBeNull();
  });
  it('rejects bad defaultAction', () => {
    const svc = new RiskPolicyAuthService(makePrisma() as never);
    expect(svc.validatePolicy(basePolicy({ defaultAction: 'ban' as never }))).toContain(
      'defaultAction'
    );
  });
});

describe('RiskPolicyAuthService.upsertPolicy', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new RiskPolicyAuthService(prisma as never);
    await svc.upsertPolicy(basePolicy());
    expect(prisma.riskPolicy.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new RiskPolicyAuthService(makePrisma() as never);
    await expect(svc.upsertPolicy(basePolicy({ id: '' }))).rejects.toThrow(/invalid/);
  });
});

describe('RiskPolicyAuthService.loadPolicy / listPolicies', () => {
  it('returns null when missing', async () => {
    const svc = new RiskPolicyAuthService(makePrisma() as never);
    expect(await svc.loadPolicy('missing')).toBeNull();
  });
  it('parses row with JSON rules', async () => {
    const prisma = makePrisma();
    (prisma.riskPolicy.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      orgId: 'o1',
      defaultAction: 'allow',
      auditAll: true,
      rulesJson: '[]',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new RiskPolicyAuthService(prisma as never);
    const p = await svc.loadPolicy('p1');
    expect(p?.rules).toEqual([]);
  });
  it('lists org policies', async () => {
    const prisma = makePrisma();
    (prisma.riskPolicy.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'p1',
        orgId: 'o1',
        defaultAction: 'allow',
        auditAll: true,
        rulesJson: '[]',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new RiskPolicyAuthService(prisma as never);
    const rows = await svc.listPolicies('o1');
    expect(rows).toHaveLength(1);
  });
});

describe('RiskPolicyAuthService.evaluate', () => {
  it('returns allow when no rule fires', () => {
    const svc = new RiskPolicyAuthService(makePrisma() as never);
    const dec = svc.evaluate({
      policy: basePolicy({ rules: [] }),
      signals: [baseSignal()],
      actorId: 'u1',
    });
    expect(dec.action).toBe('allow');
  });
});

describe('RiskPolicyAuthService.persistDecision', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new RiskPolicyAuthService(prisma as never);
    await svc.persistDecision({
      id: 'd1',
      orgId: 'o1',
      actorId: 'u1',
      score: 0,
      band: 'low',
      action: 'allow',
      firedRules: [],
      detail: 'none',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(prisma.riskDecision.upsert).toHaveBeenCalledTimes(1);
  });
});
