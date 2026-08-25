/**
 * Scheduled import/export — NestJS auth service spec (Stage 88).
 */

import { ScheduledImportAuthService } from './scheduled-import.auth.service';

interface IPrismaMock {
  importJob: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    importJob: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string }; create: Record<string, unknown>; update?: Record<string, unknown> }).where;
        const create = (args as { create: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = store.get(w.id);
        if (existing) Object.assign(existing, update ?? {});
        else store.set(w.id, { ...create });
        return undefined;
      }),
      findUnique: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        return store.get(w.id) ?? null;
      }),
      update: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string }; data: Record<string, unknown> }).where;
        const data = (args as { data: Record<string, unknown> }).data;
        const existing = store.get(w.id);
        if (!existing) return null;
        Object.assign(existing, data);
        return existing;
      }),
    },
  };
}

const baseJob = () => ({
  id: 'job-1',
  orgId: 'o1',
  direction: 'import' as const,
  format: 'csv' as const,
  sourceUri: 's3://bucket/key',
  chunkSize: 5000,
  maxRows: 1_000_000,
  deadline: '2026-12-31T00:00:00Z',
});

describe('ScheduledImportAuthService.saveJob', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    expect(prisma.importJob.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid', async () => {
    const svc = new ScheduledImportAuthService(makePrisma() as never);
    await expect(
      svc.saveJob({
        orgId: 'o1',
        job: { ...baseJob(), sourceUri: undefined },
      })
    ).rejects.toThrow();
  });
});

describe('ScheduledImportAuthService.loadJob', () => {
  it('returns null when missing', async () => {
    const svc = new ScheduledImportAuthService(makePrisma() as never);
    expect(await svc.loadJob('o1', 'job-1')).toBeNull();
  });
  it('parses row', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    const out = await svc.loadJob('o1', 'job-1');
    expect(out?.direction).toBe('import');
    expect(out?.chunkSize).toBe(5000);
  });
});

describe('ScheduledImportAuthService.planJob', () => {
  it('plans', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    const chunks = await svc.planJob({ orgId: 'o1', jobId: 'job-1', totalRows: 12_500 });
    expect(chunks.length).toBe(3);
  });
  it('throws when missing', async () => {
    const svc = new ScheduledImportAuthService(makePrisma() as never);
    await expect(svc.planJob({ orgId: 'o1', jobId: 'nope', totalRows: 100 })).rejects.toThrow(/not found/);
  });
});

describe('ScheduledImportAuthService.checkpointJob', () => {
  it('records progress', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    const cp = await svc.checkpointJob({
      orgId: 'o1',
      jobId: 'job-1',
      rowsProcessed: 5_000,
      rowsFailed: 2,
      chunks: 1,
      now: Date.parse('2026-06-01T00:00:00Z'),
    });
    expect(cp.rowsProcessed).toBe(5_000);
    expect(prisma.importJob.update).toHaveBeenCalledTimes(1);
  });
});

describe('ScheduledImportAuthService.isFinished', () => {
  it('true when complete', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    expect(await svc.isFinished({ orgId: 'o1', jobId: 'job-1', totalRows: 0 })).toBe(true);
  });
  it('false when pending', async () => {
    const prisma = makePrisma();
    const svc = new ScheduledImportAuthService(prisma as never);
    await svc.saveJob({ orgId: 'o1', job: baseJob() });
    expect(await svc.isFinished({ orgId: 'o1', jobId: 'job-1', totalRows: 5_000_000 })).toBe(false);
  });
});

describe('ScheduledImportAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new ScheduledImportAuthService(makePrisma() as never);
    expect(typeof svc.chunkCount).toBe('function');
    expect(typeof svc.appendJob).toBe('function');
  });
});
