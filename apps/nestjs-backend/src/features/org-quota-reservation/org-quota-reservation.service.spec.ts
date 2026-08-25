import {
  canEvict,
  canReserveMore,
  consumeReservation,
  decideReservation,
  defaultReservationTtlMs,
  isReservationPriority,
  isReservationStatus,
  maxReservationsPerOrg,
  normalizeReservation,
  priorityRank,
  releaseReservation,
  sweepExpired,
  totalReserved,
  validateReservation,
} from './org-quota-reservation.service';
import type { IOrgQuotaReservation } from './org-quota-reservation.types';
import { MAX_RESERVATIONS_PER_ORG, MIN_RESERVATION_AMOUNT } from './org-quota-reservation.types';

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
  reason: 'billing dashboard',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('org-quota-reservation.isReservationStatus / isReservationPriority', () => {
  it('accepts canonical', () => {
    expect(isReservationStatus('active')).toBe(true);
    expect(isReservationPriority('critical')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isReservationStatus('forever')).toBe(false);
    expect(isReservationPriority('super')).toBe(false);
  });
});

describe('org-quota-reservation.maxReservationsPerOrg / defaultReservationTtlMs', () => {
  it('returns default', () => {
    expect(maxReservationsPerOrg()).toBe(MAX_RESERVATIONS_PER_ORG);
    expect(defaultReservationTtlMs()).toBe(86_400_000 * 7);
  });
});

describe('org-quota-reservation.priorityRank', () => {
  it('orders critical > high > normal > low', () => {
    expect(priorityRank('critical')).toBe(4);
    expect(priorityRank('high')).toBe(3);
    expect(priorityRank('normal')).toBe(2);
    expect(priorityRank('low')).toBe(1);
  });
});

describe('org-quota-reservation.validateReservation', () => {
  it('passes a healthy reservation', () => {
    expect(validateReservation(baseRes())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateReservation(baseRes({ id: '' }))).toContain('id');
  });
  it('rejects missing orgId', () => {
    expect(validateReservation(baseRes({ orgId: '' }))).toContain('orgId');
  });
  it('rejects missing baseId', () => {
    expect(validateReservation(baseRes({ baseId: '' }))).toContain('baseId');
  });
  it('rejects missing metric', () => {
    expect(validateReservation(baseRes({ metric: '' }))).toContain('metric');
  });
  it('rejects amount under min', () => {
    expect(validateReservation(baseRes({ amount: 0 }))).toContain('amount');
  });
  it('rejects unknown status', () => {
    expect(validateReservation(baseRes({ status: 'forever' as never }))).toContain('status');
  });
  it('rejects unknown priority', () => {
    expect(validateReservation(baseRes({ priority: 'urgent' as never }))).toContain('priority');
  });
});

describe('org-quota-reservation.normalizeReservation', () => {
  it('floors amount + sets default priority', () => {
    const r = normalizeReservation({
      id: 'r1',
      orgId: 'o1',
      baseId: 'b1',
      metric: 'rows',
      amount: 100.7,
    });
    expect(r.amount).toBe(100);
    expect(r.priority).toBe('normal');
    expect(r.status).toBe('active');
  });
  it('clamps amount to MIN_RESERVATION_AMOUNT', () => {
    const r = normalizeReservation({
      id: 'r1',
      orgId: 'o1',
      baseId: 'b1',
      metric: 'rows',
      amount: -5,
    });
    expect(r.amount).toBe(MIN_RESERVATION_AMOUNT);
  });
});

describe('org-quota-reservation.sweepExpired', () => {
  it('partitions by expiry', () => {
    const fresh = sweepExpired({
      reservations: [
        baseRes({ id: 'a', expiresAt: '2030-01-01T00:00:00Z' }),
        baseRes({ id: 'b', expiresAt: '2020-01-01T00:00:00Z' }),
      ],
      now: '2026-01-01T00:00:00Z',
    });
    expect(fresh.fresh.length).toBe(1);
    expect(fresh.expired.length).toBe(1);
    expect(fresh.expired[0]?.status).toBe('expired');
  });
});

describe('org-quota-reservation.totalReserved', () => {
  it('sums active reservations for (org, metric)', () => {
    expect(
      totalReserved({
        orgId: 'o1',
        metric: 'rows',
        reservations: [
          baseRes({ amount: 100 }),
          baseRes({ amount: 200, status: 'released' }),
          baseRes({ amount: 300, orgId: 'o2' }),
          baseRes({ amount: 400, metric: 'ai-credits' }),
        ],
      })
    ).toBe(100);
  });
});

describe('org-quota-reservation.releaseReservation / consumeReservation', () => {
  it('releases', () => {
    const r = releaseReservation({ reservation: baseRes() });
    expect(r.status).toBe('released');
  });
  it('consumes', () => {
    const r = consumeReservation({ reservation: baseRes() });
    expect(r.status).toBe('consumed');
    expect(r.consumed).toBe(true);
  });
});

describe('org-quota-reservation.decideReservation', () => {
  it('allows when within envelope', () => {
    const d = decideReservation({
      orgId: 'o1',
      metric: 'rows',
      envelope: 1_000_000,
      committed: 100_000,
      reservations: [baseRes({ amount: 50_000, consumed: true })],
      requested: 200_000,
    });
    expect(d.allow).toBe(true);
    expect(d.effectiveRemaining).toBe(850_000);
    expect(d.reservedForOthers).toBe(0);
  });
  it('denies when over envelope', () => {
    const d = decideReservation({
      orgId: 'o1',
      metric: 'rows',
      envelope: 100,
      committed: 50,
      reservations: [],
      requested: 60,
    });
    expect(d.allow).toBe(false);
    expect(d.effectiveRemaining).toBe(50);
  });
  it('reports unconsumed reservations as reservedForOthers', () => {
    const d = decideReservation({
      orgId: 'o1',
      metric: 'rows',
      envelope: 1_000_000,
      committed: 100_000,
      reservations: [baseRes({ amount: 50_000, consumed: false })],
      requested: 10,
    });
    expect(d.reservedForOthers).toBe(50_000);
    expect(d.reservationsAffecting).toContain('r1');
  });
  it('filters by org + metric', () => {
    const d = decideReservation({
      orgId: 'o1',
      metric: 'rows',
      envelope: 100,
      committed: 0,
      reservations: [baseRes({ orgId: 'o2' }), baseRes({ metric: 'ai-credits' })],
      requested: 10,
    });
    expect(d.reservationsAffecting.length).toBe(0);
  });
});

describe('org-quota-reservation.canReserveMore', () => {
  it('honors cap', () => {
    expect(canReserveMore(MAX_RESERVATIONS_PER_ORG - 1)).toBe(true);
    expect(canReserveMore(MAX_RESERVATIONS_PER_ORG)).toBe(false);
  });
  it('honors option', () => {
    expect(canReserveMore(3, { maxReservationsPerOrg: 4 })).toBe(true);
    expect(canReserveMore(4, { maxReservationsPerOrg: 4 })).toBe(false);
  });
});

describe('org-quota-reservation.canEvict', () => {
  it('higher priority can evict', () => {
    expect(canEvict({ existing: baseRes({ priority: 'low' }), newPriority: 'critical' })).toBe(
      true
    );
  });
  it('same priority cannot evict', () => {
    expect(canEvict({ existing: baseRes({ priority: 'normal' }), newPriority: 'normal' })).toBe(
      false
    );
  });
  it('lower priority cannot evict', () => {
    expect(canEvict({ existing: baseRes({ priority: 'critical' }), newPriority: 'low' })).toBe(
      false
    );
  });
});
