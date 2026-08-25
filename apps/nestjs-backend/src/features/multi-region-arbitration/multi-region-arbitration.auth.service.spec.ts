/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { MultiRegionArbitrationAuthService } from './multi-region-arbitration.auth.service';
import type { IWriteLease, IWriteRequest } from './multi-region-arbitration.types';

function mkPrismaMock() {
  const leaseFindUnique = vi.fn();
  const leaseFindMany = vi.fn();
  const leaseUpsert = vi.fn();
  const leaseDelete = vi.fn();
  const conflictCreate = vi.fn();
  const conflictUpdate = vi.fn();
  const conflictFindUnique = vi.fn();
  const replayCreate = vi.fn();
  const replayFindMany = vi.fn();
  const replayDeleteMany = vi.fn();
  const prisma = {
    regionWriteLease: {
      findUnique: leaseFindUnique,
      findMany: leaseFindMany,
      upsert: leaseUpsert,
    },
    regionConflict: {
      create: conflictCreate,
      update: conflictUpdate,
      findUnique: conflictFindUnique,
    },
    regionReplayQueue: {
      create: replayCreate,
      findMany: replayFindMany,
      deleteMany: replayDeleteMany,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      leaseFindUnique,
      leaseFindMany,
      leaseUpsert,
      leaseDelete,
      conflictCreate,
      conflictUpdate,
      conflictFindUnique,
      replayCreate,
      replayFindMany,
      replayDeleteMany,
    },
  };
}

const baseReq = (over: Partial<IWriteRequest> = {}): IWriteRequest => ({
  resourceKey: 'row:tbl1:rec1',
  regionId: 'us-east-1',
  holderId: 'writer-1',
  baseVersion: 0,
  ttlMs: 5_000,
  now: '2026-01-01T00:00:02Z',
  ...over,
});

const baseLease = (over: Partial<IWriteLease> = {}): IWriteLease => ({
  resourceKey: 'row:tbl1:rec1',
  regionId: 'us-east-1',
  holderId: 'writer-1',
  acquiredAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T00:00:05Z',
  generation: 1,
  state: 'active',
  ...over,
});

describe('MultiRegionArbitrationAuthService', () => {
  it('validate() delegates', () => {
    const { prisma } = mkPrismaMock();
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(svc.validate(baseReq())).toBeNull();
    expect(svc.validate(baseReq({ resourceKey: '' }))).toContain('resourceKey');
  });

  it('loadLease() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue(null);
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(await svc.loadLease('row:tbl1:rec1')).toBeNull();
  });

  it('loadLease() maps a row', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue({
      ...baseLease(),
      acquiredAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:00:05Z'),
    });
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const lease = await svc.loadLease('row:tbl1:rec1');
    expect(lease?.generation).toBe(1);
  });

  it('arbitrateAndPersist() admits and persists when no lease', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue(null);
    mocks.leaseUpsert.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const r = await svc.arbitrateAndPersist({ request: baseReq() });
    expect(r.kind).toBe('admit');
    expect(mocks.leaseUpsert).toHaveBeenCalled();
  });

  it('arbitrateAndPersist() rejects without persisting', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue({
      ...baseLease(),
      acquiredAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:00:05Z'),
    });
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const r = await svc.arbitrateAndPersist({
      request: baseReq({ regionId: 'eu-central-1' }),
    });
    expect(r.kind).toBe('reject');
    expect(mocks.leaseUpsert).not.toHaveBeenCalled();
  });

  it('revokeLease() flips state', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue({
      ...baseLease(),
      acquiredAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:00:05Z'),
    });
    mocks.leaseUpsert.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(await svc.revokeLease('row:tbl1:rec1')).toBe(true);
  });

  it('revokeLease() returns false when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.leaseFindUnique.mockResolvedValue(null);
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(await svc.revokeLease('row:tbl1:rec1')).toBe(false);
  });

  it('recordConflict() persists', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.conflictCreate.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    await svc.recordConflict({
      resourceKey: 'row:tbl1:rec1',
      winnerRegion: 'us-east-1',
      loserRegion: 'eu-central-1',
      winnerVersion: 5,
      loserVersion: 4,
    });
    expect(mocks.conflictCreate).toHaveBeenCalled();
  });

  it('enqueueReplay() appends and persists', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.replayFindMany.mockResolvedValue([]);
    mocks.replayCreate.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const entry = await svc.enqueueReplay({
      conflictId: 'c1',
      regionId: 'eu-central-1',
      payload: { x: 1 },
    });
    expect(entry.conflictId).toBe('c1');
    expect(mocks.replayCreate).toHaveBeenCalled();
  });

  it('readyReplays() filters by cutoff', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.replayFindMany.mockResolvedValue([
      {
        id: 'r1',
        conflictId: 'c1',
        regionId: 'eu-central-1',
        payload: {},
        enqueuedAt: new Date('2026-01-01T00:00:00Z'),
        attempts: 0,
        nextAttemptAt: new Date('2026-01-01T00:00:01Z'),
      },
    ]);
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const out = await svc.readyReplays('2026-01-01T00:00:05Z');
    expect(out.length).toBe(1);
  });

  it('markReplayed() stamps the conflict', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.conflictFindUnique.mockResolvedValue({
      id: 'c1',
      resourceKey: 'r',
      winnerRegion: 'a',
      loserRegion: 'b',
      winnerVersion: 1,
      loserVersion: 0,
      resolution: 'last-writer-wins',
      detectedAt: new Date('2026-01-01T00:00:00Z'),
      replayedAt: null,
    });
    mocks.conflictUpdate.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(await svc.markReplayed('c1', '2026-01-01T00:00:10Z')).toBe(true);
  });

  it('markReplayed() returns false when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.conflictFindUnique.mockResolvedValue(null);
    const svc = new MultiRegionArbitrationAuthService(prisma);
    expect(await svc.markReplayed('missing', '2026-01-01T00:00:10Z')).toBe(false);
  });

  it('detectSplitBrain() delegates to pure helper', () => {
    const { prisma } = mkPrismaMock();
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const r = svc.detectSplitBrain({
      fleet: [
        { regionId: 'a', now: '', skewMs: 0 },
        { regionId: 'b', now: '', skewMs: 5_000 },
      ],
    });
    expect(r.split).toBe(true);
  });

  it('pruneQueue() reports dropped entries', async () => {
    const { prisma, mocks } = mkPrismaMock();
    const big = Array.from({ length: 1027 }, (_, i) => ({
      id: `r${i}`,
      conflictId: 'c1',
      regionId: 'eu-central-1',
      payload: {},
      enqueuedAt: new Date('2026-01-01T00:00:00Z'),
      attempts: 0,
      nextAttemptAt: new Date('2026-01-01T00:00:01Z'),
    }));
    mocks.replayFindMany.mockResolvedValue(big);
    mocks.replayDeleteMany.mockResolvedValue({});
    const svc = new MultiRegionArbitrationAuthService(prisma);
    const dropped = await svc.pruneQueue();
    expect(dropped).toBe(3);
  });
});
