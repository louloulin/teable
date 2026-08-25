/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { WorkspaceMirrorAuthService } from './workspace-mirror.auth.service';
import type { IMirrorConfig, IMirrorLogRecord } from './workspace-mirror.types';

function mkPrismaMock() {
  const mirrorLogCreate = vi.fn();
  const mirrorLogFindFirst = vi.fn();
  const mirrorLagUpsert = vi.fn();
  const mirrorLagFindMany = vi.fn();
  const prisma = {
    mirrorLog: {
      create: mirrorLogCreate,
      findFirst: mirrorLogFindFirst,
    },
    mirrorLag: {
      upsert: mirrorLagUpsert,
      findMany: mirrorLagFindMany,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: { mirrorLogCreate, mirrorLogFindFirst, mirrorLagUpsert, mirrorLagFindMany },
  };
}

const cfg: IMirrorConfig = {
  baseId: 'b1',
  primary: { region: 'us-east', url: 'https://p', priority: 0 },
  standbys: [{ region: 'eu-west', url: 'https://eu', priority: 0 }],
  maxLagSeconds: 30,
  batchSize: 50,
  enabled: true,
};

const makeRecord = (seq: number): IMirrorLogRecord => ({
  id: `r${seq}`,
  baseId: 'b1',
  region: 'us-east',
  kind: 'record.update',
  payload: { seq },
  seq,
  recordedAt: '2026-01-01T00:00:00Z',
});

describe('WorkspaceMirrorAuthService', () => {
  it('delegates validate() to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new WorkspaceMirrorAuthService(prisma);
    expect(svc.validate(cfg)).toEqual([]);
  });
  it('capture() increments seq + persists to mirrorLog', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.mirrorLogCreate.mockResolvedValue({
      id: 'r1',
      baseId: 'b1',
      region: 'us-east',
      kind: 'record.update',
      payload: { seq: 1 },
      seq: 1,
      recordedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new WorkspaceMirrorAuthService(prisma);
    const out = await svc.capture({
      baseId: 'b1',
      region: 'us-east',
      kind: 'record.update',
      payload: { foo: 'bar' },
      currentSeq: 0,
    });
    expect(out.seq).toBe(1);
    expect(mocks.mirrorLogCreate).toHaveBeenCalledOnce();
  });
  it('shipNextBatch() writes ack to mirrorLag when acknowledged', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.mirrorLagUpsert.mockResolvedValue({});
    const svc = new WorkspaceMirrorAuthService(prisma);
    const records = [makeRecord(1), makeRecord(2)];
    const { standby, result } = await svc.shipNextBatch({
      cfg,
      records,
      cursor: 0,
      acknowledged: true,
    });
    expect(standby?.region).toBe('eu-west');
    expect(result?.fromSeq).toBe(1);
    expect(result?.toSeq).toBe(2);
    expect(mocks.mirrorLagUpsert).toHaveBeenCalledOnce();
  });
  it('shipNextBatch() skips upsert when not acknowledged', async () => {
    const { prisma, mocks } = mkPrismaMock();
    const svc = new WorkspaceMirrorAuthService(prisma);
    await svc.shipNextBatch({
      cfg,
      records: [makeRecord(1)],
      cursor: 0,
      acknowledged: false,
    });
    expect(mocks.mirrorLagUpsert).not.toHaveBeenCalled();
  });
  it('lagSnapshot returns safeToPromote=false when standby lags', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.mirrorLogFindFirst.mockResolvedValue({ seq: 100 });
    mocks.mirrorLagFindMany.mockResolvedValue([
      { region: 'eu-west', lastAckSeq: 80, shippedAt: new Date(Date.now() - 1000 * 60) },
    ]);
    const svc = new WorkspaceMirrorAuthService(prisma);
    const out = await svc.lagSnapshot(cfg);
    expect(out.baseId).toBe('b1');
    expect(out.safeToPromote).toBe(false);
    expect(out.standbys[0]?.seqLag).toBe(20);
  });
});
