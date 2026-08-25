/**
 * Seat metering — NestJS auth service spec (Stage 80).
 */

import { SeatMeteringAuthService } from './seat-metering.auth.service';
import type { ISeatAssignment } from './seat-metering.types';

interface IPrismaMock {
  seatAssignment: {
    create: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    update: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
  seatCycle: {
    create: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    seatAssignment: {
      create: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
    },
    seatCycle: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

const baseRow = (over: Partial<ISeatAssignment> = {}): ISeatAssignment => ({
  id: 'a1',
  orgId: 'o1',
  actorId: 'u1',
  tier: 'pro',
  status: 'active',
  assignedAt: '2026-01-01T00:00:00Z',
  removedAt: null,
  cycleAnchor: '2026-01-01T00:00:00Z',
  ...over,
});

describe('SeatMeteringAuthService.assignSeat', () => {
  it('creates assignment', async () => {
    const prisma = makePrisma();
    const svc = new SeatMeteringAuthService(prisma as never);
    const out = await svc.assignSeat({
      id: 'a1',
      orgId: 'o1',
      actorId: 'u1',
      tier: 'pro',
      cycleAnchor: '2026-01-01T00:00:00Z',
      now: '2026-01-01T00:00:00Z',
    });
    expect(out.status).toBe('pending');
    expect(prisma.seatAssignment.create).toHaveBeenCalledTimes(1);
  });
  it('rejects when cap reached', async () => {
    const prisma = makePrisma();
    (prisma.seatAssignment.count as ReturnType<typeof vi.fn>).mockResolvedValue(10_000);
    const svc = new SeatMeteringAuthService(prisma as never);
    await expect(
      svc.assignSeat({
        id: 'a1',
        orgId: 'o1',
        actorId: 'u1',
        tier: 'pro',
        cycleAnchor: '2026-01-01T00:00:00Z',
        now: '2026-01-01T00:00:00Z',
      })
    ).rejects.toThrow('seat cap');
  });
});

describe('SeatMeteringAuthService.deactivateSeat', () => {
  it('returns null when missing', async () => {
    const svc = new SeatMeteringAuthService(makePrisma() as never);
    expect(await svc.deactivateSeat({ id: 'missing', now: '2026-02-01T00:00:00Z' })).toBeNull();
  });
  it('deactivates when present', async () => {
    const prisma = makePrisma();
    (prisma.seatAssignment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseRow());
    const svc = new SeatMeteringAuthService(prisma as never);
    const out = await svc.deactivateSeat({ id: 'a1', now: '2026-02-01T00:00:00Z' });
    expect(out!.status).toBe('deactivated');
    expect(prisma.seatAssignment.update).toHaveBeenCalledTimes(1);
  });
});

describe('SeatMeteringAuthService.buildCycleForTier', () => {
  it('builds and persists', async () => {
    const prisma = makePrisma();
    (prisma.seatAssignment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...baseRow(),
        assignedAt: new Date('2026-01-01T00:00:00Z'),
        removedAt: null,
        cycleAnchor: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new SeatMeteringAuthService(prisma as never);
    const cycle = await svc.buildCycleForTier({
      cycleId: 'c1',
      orgId: 'o1',
      tier: 'pro',
      anchor: '2026-01-01T00:00:00Z',
    });
    expect(cycle.totalCents).toBe(2400);
    await svc.persistCycle(cycle);
    expect(prisma.seatCycle.create).toHaveBeenCalledTimes(1);
  });
});

describe('SeatMeteringAuthService.countActive', () => {
  it('counts', async () => {
    const prisma = makePrisma();
    (prisma.seatAssignment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...baseRow(),
        assignedAt: new Date('2026-01-01T00:00:00Z'),
        removedAt: null,
        cycleAnchor: new Date('2026-01-01T00:00:00Z'),
      },
      {
        ...baseRow({ id: 'a2', status: 'deactivated' }),
        assignedAt: new Date('2026-01-01T00:00:00Z'),
        removedAt: new Date('2026-01-15T00:00:00Z'),
        cycleAnchor: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new SeatMeteringAuthService(prisma as never);
    expect(await svc.countActive('o1')).toBe(1);
  });
});

describe('SeatMeteringAuthService.countsAsSeat', () => {
  it('re-export', () => {
    const svc = new SeatMeteringAuthService(makePrisma() as never);
    expect(svc.countsAsSeat('active')).toBe(true);
  });
});
