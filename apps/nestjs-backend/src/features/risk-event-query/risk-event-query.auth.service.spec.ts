/**
 * Risk event query — NestJS auth service spec (Stage 79).
 */

import { RiskEventQueryAuthService } from './risk-event-query.auth.service';
import type { IRiskEventRow } from './risk-event-query.types';

interface IPrismaMock {
  riskDecision: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  loginAttempt: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  orgBanAudit: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    riskDecision: { findMany: vi.fn().mockResolvedValue([]) },
    loginAttempt: { findMany: vi.fn().mockResolvedValue([]) },
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
