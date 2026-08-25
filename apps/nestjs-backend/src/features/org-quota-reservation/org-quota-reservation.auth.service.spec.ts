/**
 * Org quota reservation NestJS auth service — persistence is mocked.
 */

import { OrgQuotaReservationAuthService } from './org-quota-reservation.auth.service';
import type { IOrgQuotaReservation } from './org-quota-reservation.types';

interface IPrismaMock {
  orgQuotaReservation: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    orgQuotaReservation: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const baseRes = (over: Partial<IOrgQuotaReservation> = {}): IOrgQuotaReservation => ({
  id: 'r1',
  orgId: 'o1',
  baseId: 'b1',
  metric: 'rows',
  amount: 1000,
  priority: 'normal',
  status: 'active',
  expiresAt: '2026-12-31T00:00:00Z',
  consumed: false,
  reason: 'billing',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('OrgQuotaReservationAuthService.validate', () => {
  it('passes healthy', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(svc.validate(baseRes())).toBeNull();
  });
  it('rejects missing', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(svc.validate(baseRes({ id: '' }))).toContain('id');
  });
});

describe('OrgQuotaReservationAuthService.normalize', () => {
  it('clamps amount', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    const r = svc.normalize({
      id: 'r1',
      orgId: 'o1',
      baseId: 'b1',
      metric: 'rows',
      amount: 100.7,
    });
    expect(r.amount).toBe(100);
  });
});

describe('OrgQuotaReservationAuthService.upsertReservation', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new OrgQuotaReservationAuthService(prisma as never);
    await svc.upsertReservation(baseRes());
    expect(prisma.orgQuotaReservation.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    await expect(svc.upsertReservation(baseRes({ id: '' }))).rejects.toThrow(/invalid/);
  });
});

describe('OrgQuotaReservationAuthService.loadReservation', () => {
  it('returns null', async () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(await svc.loadReservation('missing')).toBeNull();
  });
});

describe('OrgQuotaReservationAuthService.listReservations', () => {
  it('parses rows', async () => {
    const prisma = makePrisma();
    (prisma.orgQuotaReservation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'r1',
        orgId: 'o1',
        baseId: 'b1',
        metric: 'rows',
        amount: 100,
        priority: 'normal',
        status: 'active',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        consumed: false,
        reason: '',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new OrgQuotaReservationAuthService(prisma as never);
    const rows = await svc.listReservations('o1');
    expect(rows).toHaveLength(1);
  });
});

describe('OrgQuotaReservationAuthService.totalReserved', () => {
  it('delegates', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(
      svc.totalReserved({ orgId: 'o1', metric: 'rows', reservations: [baseRes({ amount: 100 })] })
    ).toBe(100);
  });
});

describe('OrgQuotaReservationAuthService.release / consume', () => {
  it('release throws when missing', async () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    await expect(svc.release({ id: 'missing' })).rejects.toThrow(/not found/);
  });
  it('consume throws when missing', async () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    await expect(svc.consume({ id: 'missing' })).rejects.toThrow(/not found/);
  });
});

describe('OrgQuotaReservationAuthService.decide', () => {
  it('delegates', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    const d = svc.decide({
      orgId: 'o1',
      metric: 'rows',
      envelope: 1000,
      committed: 0,
      reservations: [],
      requested: 100,
    });
    expect(d.allow).toBe(true);
  });
});

describe('OrgQuotaReservationAuthService.canReserveMore / canEvict / rank', () => {
  it('canReserveMore honors cap', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(svc.canReserveMore(255)).toBe(true);
    expect(svc.canReserveMore(256)).toBe(false);
  });
  it('canEvict honors priority', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(svc.canEvict({ existing: baseRes({ priority: 'low' }), newPriority: 'critical' })).toBe(
      true
    );
  });
  it('rank returns numeric', () => {
    const svc = new OrgQuotaReservationAuthService(makePrisma() as never);
    expect(svc.rank('critical')).toBe(4);
  });
});
