/**
 * Per-base storage metering — NestJS auth service spec (Stage 81).
 */

import { StorageMeteringAuthService } from './storage-metering.auth.service';
import type { IStorageSample } from './storage-metering.types';

interface IPrismaMock {
  storageSample: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  storageBillableLine: {
    create: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  const store: Array<Record<string, unknown>> = [];
  return {
    storageSample: {
      create: vi.fn(async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data;
        store.push({ ...data });
        return data;
      }),
      findMany: vi.fn(async (args: unknown) => {
        const where = (args as { where?: { orgId?: string; baseId?: string } }).where ?? {};
        return store.filter(
          (r) =>
            (!where.orgId || r['orgId'] === where.orgId) &&
            (!where.baseId || r['baseId'] === where.baseId)
        );
      }),
    },
    storageBillableLine: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

const baseSample = (over: Partial<IStorageSample> = {}): IStorageSample => ({
  id: 's1',
  orgId: 'o1',
  baseId: 'b1',
  kind: 'records',
  bytes: 1024,
  endedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('StorageMeteringAuthService.recordSample', () => {
  it('persists and recomputes attribution', async () => {
    const prisma = makePrisma();
    const svc = new StorageMeteringAuthService(prisma as never);
    const attr = await svc.recordSample({ sample: baseSample() });
    expect(attr.totalBytes).toBe(1024);
    expect(prisma.storageSample.create).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid sample', async () => {
    const svc = new StorageMeteringAuthService(makePrisma() as never);
    await expect(
      svc.recordSample({ sample: baseSample({ kind: '??' as never }) })
    ).rejects.toThrow();
  });
});

describe('StorageMeteringAuthService.computeAttribution', () => {
  it('builds from latest', async () => {
    const prisma = makePrisma();
    (prisma.storageSample.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 's1',
        orgId: 'o1',
        baseId: 'b1',
        kind: 'records',
        bytes: 100,
        endedAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    const svc = new StorageMeteringAuthService(prisma as never);
    const attr = await svc.computeAttribution({ orgId: 'o1', baseId: 'b1' });
    expect(attr.totalBytes).toBe(100);
    expect(attr.byKind['records']).toBe(100);
  });
});

describe('StorageMeteringAuthService.billableForOrg', () => {
  it('aggregates per-base lines', async () => {
    const prisma = makePrisma();
    (prisma.storageSample.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      (args: unknown) => {
        const where = (args as { where?: { orgId?: string; baseId?: string } }).where;
        if (where?.orgId && !where.baseId) {
          return Promise.resolve([{ baseId: 'b1' }, { baseId: 'b2' }]);
        }
        return Promise.resolve([
          {
            id: 's1',
            orgId: 'o1',
            baseId: where?.baseId ?? 'b1',
            kind: 'records',
            bytes: 1024 * 1024 * 1024,
            endedAt: new Date('2026-01-02T00:00:00Z'),
          },
        ]);
      }
    );
    const svc = new StorageMeteringAuthService(prisma as never);
    const lines = await svc.billableForOrg('o1');
    expect(lines.length).toBe(2);
  });
});

describe('StorageMeteringAuthService.persistLine', () => {
  it('writes line', async () => {
    const prisma = makePrisma();
    const svc = new StorageMeteringAuthService(prisma as never);
    await svc.persistLine({ baseId: 'b1', orgId: 'o1', bytes: 100, cents: 200 });
    expect(prisma.storageBillableLine.create).toHaveBeenCalledTimes(1);
  });
});

describe('StorageMeteringAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new StorageMeteringAuthService(makePrisma() as never);
    expect(svc.emptyByKind().records).toBe(0);
    expect(svc.billableCents({ bytes: 1024 })).toBeGreaterThanOrEqual(0);
    expect(svc.sumBillable([]).cents).toBe(0);
  });
});
