/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { ReplicaRouterAuthService } from './replica-router.auth.service';

interface IMockReplica {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockLog {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  readReplica: IMockReplica;
  readRouteLog: IMockLog;
}

const buildPrisma = (): IMockPrisma => ({
  readReplica: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
  },
  readRouteLog: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new ReplicaRouterAuthService(prisma as never);
  return { svc, prisma };
};

describe('ReplicaRouterAuthService (Stage 44)', () => {
  it('register persists a row with defaults', async () => {
    const { svc, prisma } = buildSvc();
    const r = await svc.register({
      baseId: 'b',
      kind: 'physical-replica',
      region: 'us-east-1',
      connectionUrl: 'postgres://primary.local:5432/teable',
    });
    expect(r.status).toBe('online');
    expect(r.maxLagMs).toBe(2000);
    expect(prisma.readReplica.create).toHaveBeenCalledTimes(1);
  });

  it('register rejects invalid kind', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.register({
        baseId: 'b',
        kind: 'mystery' as never,
        region: 'us',
        connectionUrl: 'postgres://x',
      })
    ).rejects.toThrow();
  });

  it('register rejects duplicate region+kind', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findFirst.mockResolvedValueOnce({ id: 'r1' } as never);
    await expect(
      svc.register({
        baseId: 'b',
        kind: 'physical-replica',
        region: 'us-east-1',
        connectionUrl: 'postgres://x',
      })
    ).rejects.toThrow(/already registered/);
  });

  it('list returns replicas for the base', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findMany.mockResolvedValueOnce([{ id: 'a' }] as never);
    const out = await svc.list('b');
    expect(out).toHaveLength(1);
    expect(prisma.readReplica.findMany).toHaveBeenCalledWith({ where: { baseId: 'b' } });
  });

  it('updateStatus patches the status field', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findUnique.mockResolvedValueOnce({ id: 'a' } as never);
    await svc.updateStatus('a', 'paused');
    expect(prisma.readReplica.update).toHaveBeenCalledTimes(1);
  });

  it('updateStatus throws on invalid status', async () => {
    const { svc } = buildSvc();
    await expect(svc.updateStatus('a', 'mystery' as never)).rejects.toThrow();
  });

  it('updateStatus throws on missing replica', async () => {
    const { svc } = buildSvc();
    await expect(svc.updateStatus('a', 'paused')).rejects.toThrow(/not found/);
  });

  it('deleteReplica removes the row', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findUnique.mockResolvedValueOnce({ id: 'a' } as never);
    await svc.deleteReplica('a');
    expect(prisma.readReplica.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
  });

  it('recordHealthCheck folds lag into status', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findUnique.mockResolvedValueOnce({
      id: 'a',
      baseId: 'b',
      kind: 'physical-replica',
      region: 'us',
      connectionUrl: 'postgres://x',
      status: 'online',
      maxLagMs: 100,
      routingPolicy: 'nearest',
      weight: 1,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    await svc.recordHealthCheck({ replicaId: 'a', status: 'online', lagMs: 500 });
    expect(prisma.readReplica.update).toHaveBeenCalledTimes(1);
  });

  it('recordHealthCheck rejects unknown replica', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.recordHealthCheck({ replicaId: 'ghost', status: 'online', lagMs: 0 })
    ).rejects.toThrow(/not found/);
  });

  it('routeForBase picks nearest replica and logs the decision', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        baseId: 'b',
        kind: 'physical-replica',
        region: 'us-east-1',
        connectionUrl: 'postgres://r1',
        status: 'online',
        maxLagMs: 2000,
        routingPolicy: 'nearest',
        weight: 1,
        createdTime: new Date(),
        updatedTime: new Date(),
      },
    ] as never);
    const decision = await svc.routeForBase({
      baseId: 'b',
      clientRegion: 'us-east-1',
      policy: 'nearest',
    });
    expect(decision.routeTo).toBe('replica');
    expect(decision.replicaId).toBe('r1');
    expect(prisma.readRouteLog.create).toHaveBeenCalledTimes(1);
  });

  it('routeForBase routes to primary when no replicas', async () => {
    const { svc, prisma } = buildSvc();
    prisma.readReplica.findMany.mockResolvedValueOnce([] as never);
    const decision = await svc.routeForBase({
      baseId: 'b',
      clientRegion: 'us',
      policy: 'nearest',
    });
    expect(decision.routeTo).toBe('primary');
    expect(decision.reason).toBe('no-replicas');
  });

  it('routeForBase rejects invalid policy', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.routeForBase({
        baseId: 'b',
        clientRegion: 'us',
        policy: 'mystery' as never,
      })
    ).rejects.toThrow();
  });

  it('listLogs filters by baseId and applies limit', async () => {
    const { svc, prisma } = buildSvc();
    await svc.listLogs({ baseId: 'b', limit: 5 });
    expect(prisma.readRouteLog.findMany).toHaveBeenCalledWith({
      where: { baseId: 'b' },
      orderBy: { createdTime: 'desc' },
      take: 5,
    });
  });

  it('exposes decideRoute / foldHealthCheck / regionHash helpers', () => {
    const { svc } = buildSvc();
    expect(svc.decideRoute).toBeDefined();
    expect(svc.foldHealthCheck).toBeDefined();
    expect(svc.regionHash('us')).toBe(svc.regionHash('us'));
  });
});
