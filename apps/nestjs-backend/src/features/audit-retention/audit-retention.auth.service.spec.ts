/**
 * Audit retention NestJS auth service — persistence is mocked.
 */

import { AuditRetentionAuthService } from './audit-retention.auth.service';
import type { IAuditEvent, IAuditRetentionPolicy } from './audit-retention.types';

interface IPrismaMock {
  auditRetentionPolicy: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown | null>;
  };
  auditRetentionJob: {
    upsert: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    auditRetentionPolicy: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    auditRetentionJob: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const basePolicy = (over: Partial<IAuditRetentionPolicy> = {}): IAuditRetentionPolicy => ({
  orgId: 'o1',
  hotDays: 90,
  coldDays: 365,
  coldTarget: 's3',
  coldBucket: 'audit',
  coldPrefix: 'events/',
  redactPii: false,
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'admin',
  ...over,
});

const baseEvent = (over: Partial<IAuditEvent> = {}): IAuditEvent => ({
  id: 'e1',
  orgId: 'o1',
  baseId: 'b1',
  action: 'row.create',
  actorId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  payload: '{}',
  ...over,
});

describe('AuditRetentionAuthService.validate', () => {
  it('passes a healthy policy', () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    expect(svc.validate(basePolicy())).toBeNull();
  });
  it('rejects invalid', () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    expect(svc.validate(basePolicy({ orgId: '' }))).toContain('orgId');
  });
});

describe('AuditRetentionAuthService.normalize', () => {
  it('clamps hot days', () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    const p = svc.normalize({ orgId: 'o1', hotDays: 9999 });
    expect(p.hotDays).toBe(365);
  });
});

describe('AuditRetentionAuthService.upsertPolicy', () => {
  it('persists via prisma upsert', async () => {
    const prisma = makePrisma();
    const svc = new AuditRetentionAuthService(prisma as never);
    await svc.upsertPolicy(basePolicy());
    expect(prisma.auditRetentionPolicy.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid policy', async () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    await expect(svc.upsertPolicy(basePolicy({ orgId: '' }))).rejects.toThrow(/invalid policy/);
  });
});

describe('AuditRetentionAuthService.loadPolicy', () => {
  it('returns null when missing', async () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    expect(await svc.loadPolicy('missing')).toBeNull();
  });
  it('parses when present', async () => {
    const prisma = makePrisma();
    (prisma.auditRetentionPolicy.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      orgId: 'o1',
      hotDays: 90,
      coldDays: 365,
      coldTarget: 's3',
      coldBucket: 'b',
      coldPrefix: 'p',
      redactPii: false,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      updatedBy: 'admin',
    });
    const svc = new AuditRetentionAuthService(prisma as never);
    const p = await svc.loadPolicy('o1');
    expect(p?.hotDays).toBe(90);
  });
});

describe('AuditRetentionAuthService.decide', () => {
  it('returns hot for recent event', () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    const d = svc.decide(
      basePolicy({ hotDays: 30 }),
      baseEvent({ createdAt: '2026-01-01T00:00:00Z' }),
      '2026-01-15T00:00:00Z'
    );
    expect(d.tier).toBe('hot');
  });
});

describe('AuditRetentionAuthService.runSweep', () => {
  it('produces a done job with metrics', async () => {
    const svc = new AuditRetentionAuthService(makePrisma() as never);
    const j = await svc.runSweep({
      orgId: 'o1',
      policy: basePolicy({ hotDays: 30, coldDays: 365 }),
      events: [
        baseEvent({ id: 'a', createdAt: '2026-01-01T00:00:00Z' }),
        baseEvent({ id: 'b', createdAt: '2020-01-01T00:00:00Z' }),
      ],
      now: '2026-01-15T00:00:00Z',
    });
    expect(j.status).toBe('done');
    expect(j.scanned).toBe(2);
    expect(j.purged).toBe(1);
  });
});

describe('AuditRetentionAuthService.persistJob', () => {
  it('delegates to prisma', async () => {
    const prisma = makePrisma();
    const svc = new AuditRetentionAuthService(prisma as never);
    await svc.persistJob({
      id: 'j1',
      orgId: 'o1',
      status: 'done',
      startedAt: '2026-01-01T00:00:00Z',
      finishedAt: '2026-01-01T01:00:00Z',
      scanned: 100,
      promotedToCold: 50,
      purged: 10,
      lastError: null,
    });
    expect(prisma.auditRetentionJob.upsert).toHaveBeenCalledTimes(1);
  });
});
