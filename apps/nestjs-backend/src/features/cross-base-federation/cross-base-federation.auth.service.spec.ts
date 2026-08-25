/**
 * Cross-base federation NestJS auth service — persistence is mocked.
 */

import { CrossBaseFederationAuthService } from './cross-base-federation.auth.service';
import type {
  IFederationEvent,
  IFederationRefresh,
  IFederationSource,
  IFederationView,
} from './cross-base-federation.types';

interface IPrismaMock {
  federationView: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  federationSource: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  federationEvent: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  federationRefresh: {
    upsert: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    federationView: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    federationSource: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    federationEvent: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    federationRefresh: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const baseView = (over: Partial<IFederationView> = {}): IFederationView => ({
  id: 'v1',
  orgId: 'o1',
  name: 'pipeline',
  description: 'cross-base pipeline view',
  status: 'active',
  refreshMode: 'event',
  refreshIntervalSeconds: 60,
  lastRefreshedBy: null,
  lastRefreshedAt: null,
  lastStalenessSeconds: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseSource = (over: Partial<IFederationSource> = {}): IFederationSource => ({
  id: 's1',
  baseId: 'b1',
  kind: 'table',
  targetId: 't1',
  alias: 'pipeline',
  fields: null,
  filter: null,
  ...over,
});

const baseEvent = (over: Partial<IFederationEvent> = {}): IFederationEvent => ({
  id: 'e1',
  viewId: 'v1',
  sourceId: 's1',
  kind: 'row.updated',
  occurredAt: '2026-01-01T00:00:00Z',
  summary: 'updated 12 rows',
  processed: false,
  ...over,
});

describe('CrossBaseFederationAuthService.validateView', () => {
  it('passes healthy', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(svc.validateView(baseView())).toBeNull();
  });
  it('rejects invalid', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(svc.validateView(baseView({ id: '' }))).toContain('id');
  });
});

describe('CrossBaseFederationAuthService.validateSource', () => {
  it('passes', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(svc.validateSource(baseSource(), 'v1')).toBeNull();
  });
  it('rejects alias conflict', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(svc.validateSource(baseSource({ id: 'v1' }), 'v1')).toContain('must differ');
  });
});

describe('CrossBaseFederationAuthService.upsertView / loadView / listViews', () => {
  it('upserts view', async () => {
    const prisma = makePrisma();
    const svc = new CrossBaseFederationAuthService(prisma as never);
    await svc.upsertView(baseView());
    expect(prisma.federationView.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    await expect(svc.upsertView(baseView({ id: '' }))).rejects.toThrow(/invalid/);
  });
  it('returns null when missing', async () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(await svc.loadView('missing')).toBeNull();
  });
  it('parses list', async () => {
    const prisma = makePrisma();
    (prisma.federationView.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'v1',
        orgId: 'o1',
        name: 'pipeline',
        description: 'x',
        status: 'active',
        refreshMode: 'event',
        refreshIntervalSeconds: 60,
        lastRefreshedBy: null,
        lastRefreshedAt: null,
        lastStalenessSeconds: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new CrossBaseFederationAuthService(prisma as never);
    const rows = await svc.listViews('o1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
  });
});

describe('CrossBaseFederationAuthService.upsertSource / listSources', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new CrossBaseFederationAuthService(prisma as never);
    await svc.upsertSource(baseSource(), 'v1');
    expect(prisma.federationSource.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    await expect(svc.upsertSource(baseSource({ id: '' }), 'v1')).rejects.toThrow(/invalid/);
  });
  it('parses list', async () => {
    const prisma = makePrisma();
    (prisma.federationSource.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 's1',
        baseId: 'b1',
        kind: 'table',
        targetId: 't1',
        alias: 'pipeline',
        fields: null,
        filter: null,
      },
    ]);
    const svc = new CrossBaseFederationAuthService(prisma as never);
    const rows = await svc.listSources('v1');
    expect(rows).toHaveLength(1);
  });
});

describe('CrossBaseFederationAuthService.aliasMap', () => {
  it('builds map', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    const m = svc.aliasMap([baseSource({ alias: 'a' }), baseSource({ id: 's2', alias: 'b' })]);
    expect(Object.keys(m).sort()).toEqual(['a', 'b']);
  });
});

describe('CrossBaseFederationAuthService.recordEvent / listPendingEvents', () => {
  it('records event', async () => {
    const prisma = makePrisma();
    const svc = new CrossBaseFederationAuthService(prisma as never);
    const ev = await svc.recordEvent({
      id: 'e1',
      viewId: 'v1',
      sourceId: 's1',
      kind: 'row.updated',
      summary: 'x',
    });
    expect(ev.processed).toBe(false);
    expect(prisma.federationEvent.create).toHaveBeenCalledTimes(1);
  });
  it('lists events', async () => {
    const prisma = makePrisma();
    (prisma.federationEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'e1',
        viewId: 'v1',
        sourceId: 's1',
        kind: 'row.updated',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        summary: 'x',
        processed: false,
      },
    ]);
    const svc = new CrossBaseFederationAuthService(prisma as never);
    const rows = await svc.listPendingEvents('v1');
    expect(rows).toHaveLength(1);
  });
});

describe('CrossBaseFederationAuthService.shouldRefresh', () => {
  it('delegates', () => {
    const svc = new CrossBaseFederationAuthService(makePrisma() as never);
    expect(svc.shouldRefresh(baseView({ status: 'paused' }), [baseEvent()])).toBe(false);
  });
});

describe('CrossBaseFederationAuthService.runRefresh / persistRefresh', () => {
  it('runs and persists refresh', async () => {
    const prisma = makePrisma();
    (prisma.federationView.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'v1',
      orgId: 'o1',
      name: 'pipeline',
      description: '',
      status: 'active',
      refreshMode: 'event',
      refreshIntervalSeconds: 60,
      lastRefreshedBy: null,
      lastRefreshedAt: null,
      lastStalenessSeconds: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    (prisma.federationEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'e1',
        viewId: 'v1',
        sourceId: 's1',
        kind: 'row.updated',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        summary: 'x',
        processed: false,
      },
    ]);
    const svc = new CrossBaseFederationAuthService(prisma as never);
    const refresh: IFederationRefresh = await svc.runRefresh({
      viewId: 'v1',
      actorId: 'u1',
      refreshName: 'j1',
    });
    expect(refresh.status).toBe('done');
    expect(refresh.eventsConsumed).toBe(1);
    await svc.persistRefresh(refresh);
    expect(prisma.federationRefresh.upsert).toHaveBeenCalledTimes(1);
  });
});
