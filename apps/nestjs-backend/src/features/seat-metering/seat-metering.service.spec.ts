/**
 * Seat metering — pure helpers spec (Stage 80).
 */

import {
  activeFraction,
  buildCycle,
  countsAsSeat,
  isSeatStatus,
  isSeatTier,
  maxSeatsPerOrg,
  nextCycle,
  proratedSeats,
  prorationUnit,
  sumCycles,
  totalActiveSeats,
  unitPriceCents,
  validateAssignment,
} from './seat-metering.service';
import type { ISeatAssignment } from './seat-metering.types';

const baseAssignment = (over: Partial<ISeatAssignment> = {}): ISeatAssignment => ({
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

describe('seat-metering.isSeatTier / isSeatStatus', () => {
  it('accepts', () => {
    expect(isSeatTier('pro')).toBe(true);
    expect(isSeatStatus('active')).toBe(true);
  });
  it('rejects', () => {
    expect(isSeatTier('??')).toBe(false);
    expect(isSeatStatus('??')).toBe(false);
  });
});

describe('seat-metering.unitPriceCents', () => {
  it('matches SEAT_PRICES_CENTS', () => {
    expect(unitPriceCents('starter')).toBe(800);
    expect(unitPriceCents('pro')).toBe(2400);
    expect(unitPriceCents('enterprise')).toBe(6400);
  });
});

describe('seat-metering.validateAssignment', () => {
  it('passes a good assignment', () => {
    expect(validateAssignment(baseAssignment())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateAssignment(baseAssignment({ id: '' }))).toBe('id required');
  });
  it('rejects unknown tier', () => {
    expect(validateAssignment(baseAssignment({ tier: '??' as never }))).toContain('tier');
  });
  it('rejects unknown status', () => {
    expect(validateAssignment(baseAssignment({ status: '??' as never }))).toContain('status');
  });
});

describe('seat-metering.countsAsSeat', () => {
  it('true for active/invited/pending', () => {
    expect(countsAsSeat('active')).toBe(true);
    expect(countsAsSeat('invited')).toBe(true);
    expect(countsAsSeat('pending')).toBe(true);
  });
  it('false for deactivated', () => {
    expect(countsAsSeat('deactivated')).toBe(false);
  });
});

describe('seat-metering.activeFraction', () => {
  it('full cycle', () => {
    expect(
      activeFraction({
        assignedAt: '2026-01-01T00:00:00Z',
        removedAt: null,
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBe(1);
  });
  it('half cycle', () => {
    expect(
      activeFraction({
        assignedAt: '2026-01-16T00:00:00Z',
        removedAt: null,
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBeGreaterThan(0.4);
    expect(
      activeFraction({
        assignedAt: '2026-01-16T00:00:00Z',
        removedAt: null,
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBeLessThan(0.6);
  });
  it('zero when before cycle', () => {
    expect(
      activeFraction({
        assignedAt: '2025-12-01T00:00:00Z',
        removedAt: '2025-12-15T00:00:00Z',
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBe(0);
  });
});

describe('seat-metering.proratedSeats', () => {
  it('full cycle', () => {
    expect(
      proratedSeats({
        active: 1,
        assignments: [baseAssignment()],
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBe(1);
  });
  it('skips deactivated', () => {
    expect(
      proratedSeats({
        active: 1,
        assignments: [baseAssignment({ status: 'deactivated' })],
        cycleStart: '2026-01-01T00:00:00Z',
        cycleEnd: '2026-01-31T00:00:00Z',
      })
    ).toBe(1);
  });
});

describe('seat-metering.buildCycle', () => {
  it('rolls up', () => {
    const c = buildCycle({
      id: 'c1',
      orgId: 'o1',
      tier: 'pro',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-31T00:00:00Z',
      assignments: [baseAssignment()],
      activeSeats: 1,
    });
    expect(c.totalCents).toBe(2400);
    expect(c.seatsProrated).toBe(1);
    expect(c.unitPriceCents).toBe(2400);
  });
});

describe('seat-metering.nextCycle', () => {
  it('advances by SEAT_CYCLE_DAYS', () => {
    const win = nextCycle({ anchor: '2026-01-01T00:00:00Z' });
    expect(win.endedAt > win.startedAt).toBe(true);
  });
});

describe('seat-metering.maxSeatsPerOrg', () => {
  it('returns constant', () => {
    expect(maxSeatsPerOrg()).toBe(10_000);
  });
});

describe('seat-metering.totalActiveSeats', () => {
  it('counts active+invited+pending', () => {
    expect(
      totalActiveSeats([
        baseAssignment(),
        baseAssignment({ id: 'a2', status: 'invited' }),
        baseAssignment({ id: 'a3', status: 'deactivated' }),
      ])
    ).toBe(2);
  });
});

describe('seat-metering.sumCycles', () => {
  it('aggregates', () => {
    const out = sumCycles([
      {
        id: 'c1',
        orgId: 'o1',
        tier: 'starter',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-31T00:00:00Z',
        seatsActive: 1,
        seatsProrated: 1,
        unitPriceCents: 800,
        totalCents: 800,
      },
      {
        id: 'c2',
        orgId: 'o1',
        tier: 'pro',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-31T00:00:00Z',
        seatsActive: 1,
        seatsProrated: 1,
        unitPriceCents: 2400,
        totalCents: 2400,
      },
    ]);
    expect(out.cents).toBe(3200);
    expect(out.seats).toBe(2);
  });
});

describe('seat-metering.prorationUnit', () => {
  it('returns 1/denominator', () => {
    expect(prorationUnit()).toBeCloseTo(1 / 30);
  });
});
