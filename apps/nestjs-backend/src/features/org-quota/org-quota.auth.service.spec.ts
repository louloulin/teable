import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { OrgQuotaAuthService } from './org-quota.auth.service';
import type { IOrgQuotaEnvelope } from './org-quota.types';

function mkPrismaMock() {
  const envelopeFindUnique = vi.fn();
  const envelopeUpsert = vi.fn();
  const fairnessFindUnique = vi.fn();
  const fairnessUpsert = vi.fn();
  const overageCreate = vi.fn();
  const overageFindMany = vi.fn();
  const prisma = {
    orgQuotaEnvelope: {
      findUnique: envelopeFindUnique,
      upsert: envelopeUpsert,
    },
    orgQuotaFairness: {
      findUnique: fairnessFindUnique,
      upsert: fairnessUpsert,
    },
    orgQuotaOverage: {
      create: overageCreate,
      findMany: overageFindMany,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      envelopeFindUnique,
      envelopeUpsert,
      fairnessFindUnique,
      fairnessUpsert,
      overageCreate,
      overageFindMany,
    },
  };
}

const baseEnv: IOrgQuotaEnvelope = {
  orgId: 'org1',
  caps: { rows: 1000, aiCredits: 500 },
  policy: 'soft',
  softFraction: 0.8,
  windowSeconds: 3600,
};

describe('OrgQuotaAuthService', () => {
  it('validate() delegates to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new OrgQuotaAuthService(prisma);
    expect(svc.validate(baseEnv)).toEqual([]);
  });

  it('loadEnvelope() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue(null);
    const svc = new OrgQuotaAuthService(prisma);
    expect(await svc.loadEnvelope('missing')).toBeNull();
  });

  it('loadEnvelope() maps a row to domain', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue({
      orgId: 'org1',
      caps: { rows: 1000 },
      policy: 'soft',
      softFraction: 0.8,
      windowSeconds: 3600,
      notes: 'demo',
    });
    const svc = new OrgQuotaAuthService(prisma);
    const env = await svc.loadEnvelope('org1');
    expect(env?.caps.rows).toBe(1000);
    expect(env?.notes).toBe('demo');
  });

  it('persistEnvelope() forwards to Prisma upsert', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeUpsert.mockResolvedValue({});
    const svc = new OrgQuotaAuthService(prisma);
    await svc.persistEnvelope(baseEnv);
    expect(mocks.envelopeUpsert).toHaveBeenCalledTimes(1);
  });

  it('loadFairness() returns empty state when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fairnessFindUnique.mockResolvedValue(null);
    const svc = new OrgQuotaAuthService(prisma);
    const state = await svc.loadFairness('org1');
    expect(state.deficits).toEqual({});
    expect(state.totalGrants).toBe(0);
  });

  it('persistFairness() forwards to Prisma upsert', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fairnessUpsert.mockResolvedValue({});
    const svc = new OrgQuotaAuthService(prisma);
    await svc.persistFairness({
      orgId: 'org1',
      deficits: { a: 1 },
      lastGrantByBase: {},
      totalGrants: 1,
    });
    expect(mocks.fairnessUpsert).toHaveBeenCalledTimes(1);
  });

  it('recordOverage() persists the event', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.overageCreate.mockResolvedValue({});
    const svc = new OrgQuotaAuthService(prisma);
    await svc.recordOverage({
      envelope: baseEnv,
      baseId: 'b1',
      kind: 'rows',
      requested: 10,
      decision: 'deny',
    });
    expect(mocks.overageCreate).toHaveBeenCalledTimes(1);
  });

  it('checkAndGrant() allow path', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue(null);
    mocks.fairnessFindUnique.mockResolvedValue(null);
    mocks.fairnessUpsert.mockResolvedValue({});
    const svc = new OrgQuotaAuthService(prisma);
    const r = await svc.checkAndGrant({
      orgId: 'org1',
      baseId: 'b1',
      kind: 'rows',
      requested: 10,
      perBaseUsed: [{ baseId: 'b1', used: 50 }],
      windowStart: '2026-01-01T00:00:00Z',
      windowEnd: '2026-01-01T01:00:00Z',
    });
    expect(r.result.decision).toBe('allow');
    expect(r.overage).toBeUndefined();
  });

  it('checkAndGrant() deny path records overage', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue({
      orgId: 'org1',
      caps: { rows: 100 },
      policy: 'hard',
      softFraction: 0.8,
      windowSeconds: 3600,
      notes: null,
    });
    mocks.fairnessFindUnique.mockResolvedValue(null);
    mocks.fairnessUpsert.mockResolvedValue({});
    mocks.overageCreate.mockResolvedValue({});
    const svc = new OrgQuotaAuthService(prisma);
    const r = await svc.checkAndGrant({
      orgId: 'org1',
      baseId: 'b1',
      kind: 'rows',
      requested: 10_000,
      perBaseUsed: [{ baseId: 'b1', used: 5000 }],
      windowStart: '2026-01-01T00:00:00Z',
      windowEnd: '2026-01-01T01:00:00Z',
    });
    expect(r.result.decision).toBe('deny');
    expect(r.overage).toBeDefined();
  });

  it('remaining() returns null when no envelope', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue(null);
    const svc = new OrgQuotaAuthService(prisma);
    expect(await svc.remaining('org1', 'rows', 100)).toBeNull();
  });

  it('setPolicy() does nothing when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.envelopeFindUnique.mockResolvedValue(null);
    const svc = new OrgQuotaAuthService(prisma);
    await svc.setPolicy('org1', 'hard');
    expect(mocks.envelopeUpsert).not.toHaveBeenCalled();
  });
});
