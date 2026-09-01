/**
 * Risk event query — NestJS auth service spec (Stage 79).
 */

import { RiskEventQueryAuthService } from './risk-event-query.auth.service';
import type { IRiskEventRow } from './risk-event-query.types';

interface IPrismaMock {
  riskDecision: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    count: (args: unknown) => Promise<number>;
  };
  loginAttempt: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    count: (args: unknown) => Promise<number>;
  };
  orgBanAudit: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    riskDecision: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    loginAttempt: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    orgBanAudit: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const baseRow = (over: Partial<IRiskEventRow> = {}): IRiskEventRow => ({
  id: 'e1',
  orgId: 'o1',
  actorId: 'u1',
  kind: 'risk-decision',
  decision: 'allow',
  band: 'low',
  detail: 'clean login',
  occurredAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('RiskEventQueryAuthService.buildQuery', () => {
  it('throws on bad filter', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    expect(() => svc.buildQuery({ filter: { limit: 0 } })).toThrow();
  });
  it('builds', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    const q = svc.buildQuery({ filter: {} });
    expect(q.filter.limit).toBe(50);
  });
});

describe('RiskEventQueryAuthService.toWhere', () => {
  it('compiles org filter', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    expect(svc.toWhere({ orgIds: ['o1'] })).toEqual({ orgId: { in: ['o1'] } });
  });
});

describe('RiskEventQueryAuthService.orderBy', () => {
  it('desc default', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    expect(svc.orderBy({})[0]?.['occurredAt']).toBe('desc');
  });
});

describe('RiskEventQueryAuthService.cursorWhere', () => {
  it('builds', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    const w = svc.cursorWhere({
      filter: { order: 'asc' },
      cursor: { key: '2026-01-01T00:00:00Z', id: 'x' },
    });
    expect(w['OR']).toBeDefined();
  });
});

describe('RiskEventQueryAuthService.nextCursor', () => {
  it('null', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    expect(svc.nextCursor({ last: null })).toBeNull();
  });
  it('builds', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    const c = svc.nextCursor({ last: baseRow() });
    expect(c?.key).toBe('2026-01-01T00:00:00Z');
  });
});

describe('RiskEventQueryAuthService.paginateInMemory', () => {
  it('pages', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    const rows = Array.from({ length: 5 }, (_, i) =>
      baseRow({ id: `e${i}`, occurredAt: `2026-01-0${i + 1}T00:00:00Z` })
    );
    const page = svc.paginateInMemory({ rows, filter: { limit: 2, order: 'desc' } });
    expect(page.rows.length).toBe(2);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe('RiskEventQueryAuthService.searchDecisions', () => {
  it('queries risk decisions', async () => {
    const prisma = makePrisma();
    (prisma.riskDecision.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'd1',
        orgId: 'o1',
        actorId: 'u1',
        band: 'high',
        action: 'hard-block',
        detail: 'burst',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new RiskEventQueryAuthService(prisma as never);
    const out = await svc.searchDecisions({ filter: {} });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0]!.kind).toBe('risk-decision');
    expect(prisma.recent === undefined ? prisma.riskDecision.findMany : null).toBeDefined();
  });

  it('uses RiskDecision field names for filters and ordering', async () => {
    const prisma = makePrisma();
    const svc = new RiskEventQueryAuthService(prisma as never);
    await svc.searchDecisions({
      filter: {
        decisions: ['hard-block'],
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
      },
    });
    const args = (prisma.riskDecision.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, string>>;
    };
    expect(args.where).toMatchObject({
      action: { in: ['hard-block'] },
      createdAt: { gte: '2026-01-01T00:00:00Z', lt: '2026-02-01T00:00:00Z' },
    });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(JSON.stringify(args.where)).not.toContain('occurredAt');
  });

  it('countDecisions uses createdAt instead of the unified occurredAt name', async () => {
    const prisma = makePrisma();
    const svc = new RiskEventQueryAuthService(prisma as never);
    await svc.countDecisions({ filter: { from: '2026-01-01T00:00:00Z' } });
    const args = (prisma.riskDecision.count as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ createdAt: { gte: '2026-01-01T00:00:00Z' } });
  });
});

describe('RiskEventQueryAuthService.searchLoginAttempts', () => {
  it('queries login attempts', async () => {
    const prisma = makePrisma();
    (prisma.loginAttempt.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'l1',
        orgId: 'o1',
        actorId: 'u1',
        band: 'low',
        outcome: 'success',
        failureReason: null,
        userAgent: 'curl',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new RiskEventQueryAuthService(prisma as never);
    const out = await svc.searchLoginAttempts({ filter: {} });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0]!.kind).toBe('login-attempt');
  });

  it('keeps LoginAttempt filters on occurredAt and outcome', async () => {
    const prisma = makePrisma();
    const svc = new RiskEventQueryAuthService(prisma as never);
    await svc.searchLoginAttempts({ filter: { decisions: ['allow'], text: 'curl' } });
    const args = (prisma.loginAttempt.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, string>>;
    };
    expect(args.where).toMatchObject({ outcome: { in: ['success'] } });
    expect(args.where).toHaveProperty('OR');
    expect(args.orderBy).toEqual([{ occurredAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('RiskEventQueryAuthService.rowFromBanAudit', () => {
  it('maps', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    const r = svc.rowFromBanAudit({
      id: 'b1',
      orgId: 'o1',
      actorId: 'admin',
      action: 'create',
      detail: 'spam',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(r.kind).toBe('ban-action');
    expect(r.detail).toContain('spam');
  });
});

describe('RiskEventQueryAuthService.isRiskEventKind', () => {
  it('predicate', () => {
    const svc = new RiskEventQueryAuthService(makePrisma() as never);
    expect(svc.isRiskEventKind('risk-decision')).toBe(true);
    expect(svc.isRiskEventKind('??')).toBe(false);
  });
});
