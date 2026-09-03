/**
 * Billing proration math spec — covers every edge case the Stripe
 * webhook side will rely on when reconciling Stripe-sourced proration
 * reports against our internal numbers.
 */
import { describe, expect, it } from 'vitest';
import { BillingProrationService, type IPlanRate } from './billing-proration.service';
import type { BillingPlanCode } from './billing.types';

const RATE = (overrides: Partial<IPlanRate> = {}): IPlanRate => ({
  monthlyPriceCentsPerSeat: 2000,
  currency: 'USD',
  ...overrides,
});

const start = new Date('2026-09-01T00:00:00Z');
const end = new Date('2026-10-01T00:00:00Z');
const midPeriod = new Date('2026-09-16T00:00:00Z'); // exactly half-way

function buildSvc() {
  return new BillingProrationService();
}

describe('BillingProrationService.previewSeatChange', () => {
  it('returns a noOp proration with zero cents when deltaSeats is 0', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 5,
      deltaSeats: 0,
      rate: RATE(),
    });
    expect(out.noOp).toBe(true);
    expect(out.prorationCents).toBe(0);
    expect(out.remainingRatio).toBe(0);
    expect(out.currency).toBe('USD');
  });

  it('charges half-month for a 2-seat upgrade at the period midpoint', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 5,
      deltaSeats: 2,
      rate: RATE({ monthlyPriceCentsPerSeat: 2000 }),
    });
    // 2 seats × 2000 cents × 0.5 = 2000 cents (a credit line for half-month)
    expect(out.noOp).toBe(false);
    expect(out.prorationCents).toBe(2000);
    expect(out.remainingRatio).toBeCloseTo(0.5, 5);
    expect(out.periodSeconds).toBe(2_592_000); // 30 days
    // remaining ≈ 15 days = 1,296,000 seconds
    expect(out.remainingSeconds).toBe(1_296_000);
  });

  it('credits the customer when deltaSeats is negative (downgrade)', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 7,
      deltaSeats: -2,
      rate: RATE({ monthlyPriceCentsPerSeat: 2000 }),
    });
    expect(out.prorationCents).toBe(-2000);
    expect(out.noOp).toBe(false);
  });

  it('charges the full monthly amount when the change happens at period start', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: start,
      currentSeats: 5,
      deltaSeats: 1,
      rate: RATE({ monthlyPriceCentsPerSeat: 3000 }),
    });
    expect(out.prorationCents).toBe(3000);
    expect(out.remainingRatio).toBe(1);
  });

  it('returns zero proration when the period has fully elapsed', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: new Date('2026-12-01T00:00:00Z'),
      currentSeats: 5,
      deltaSeats: 4,
      rate: RATE(),
    });
    expect(out.prorationCents).toBe(0);
    expect(out.remainingRatio).toBe(0);
    expect(out.noOp).toBe(false); // it's zero, but not a no-op semantically
  });

  it('handles an inverted period (start >= end) without throwing', () => {
    const svc = buildSvc();
    const out = svc.previewSeatChange({
      currentPeriodStart: end,
      currentPeriodEnd: start,
      asOf: midPeriod,
      currentSeats: 5,
      deltaSeats: 1,
      rate: RATE(),
    });
    expect(out.prorationCents).toBe(0);
  });

  it('handles February (28-day) periods consistently', () => {
    const svc = buildSvc();
    const febStart = new Date('2026-02-01T00:00:00Z');
    const febEnd = new Date('2026-02-28T00:00:00Z');
    const out = svc.previewSeatChange({
      currentPeriodStart: febStart,
      currentPeriodEnd: febEnd,
      asOf: new Date('2026-02-15T00:00:00Z'),
      currentSeats: 4,
      deltaSeats: 6,
      rate: RATE({ monthlyPriceCentsPerSeat: 1000 }),
    });
    // 6 × 1000 × (13 days remaining / 27 day period) ≈ 2889 cents
    expect(out.periodSeconds).toBe(27 * 86_400);
    expect(out.prorationCents).toBeGreaterThan(2800);
    expect(out.prorationCents).toBeLessThan(3000);
  });
});

describe('BillingProrationService.previewPlanChange', () => {
  const rateCard: Record<BillingPlanCode, IPlanRate> = {
    free: RATE({ monthlyPriceCentsPerSeat: 0 }),
    pro: RATE({ monthlyPriceCentsPerSeat: 2000 }),
    team: RATE({ monthlyPriceCentsPerSeat: 3000 }),
    business: RATE({ monthlyPriceCentsPerSeat: 4000 }),
    enterprise: RATE({ monthlyPriceCentsPerSeat: 5000 }),
  };

  it('returns a noOp proration when both plan and seats are unchanged', () => {
    const svc = buildSvc();
    const out = svc.previewPlanChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 5,
      newSeats: 5,
      currentPlanCode: 'pro',
      newPlanCode: 'pro',
      rateCard,
    });
    expect(out.noOp).toBe(true);
    expect(out.prorationCents).toBe(0);
  });

  it('charges the upsell delta when upgrading pro 5 → business 8 at the midpoint', () => {
    const svc = buildSvc();
    const out = svc.previewPlanChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 5,
      newSeats: 8,
      currentPlanCode: 'pro',
      newPlanCode: 'business',
      rateCard,
    });
    // New prorated = 8 × 4000 × 0.5 = 16000
    // Old prorated = 5 × 2000 × 0.5 = 5000
    // Net proration = 11000
    expect(out.noOp).toBe(false);
    expect(out.prorationCents).toBe(11000);
    expect(out.currency).toBe('USD');
  });

  it('credits when downgrading team 10 → pro 5 at the midpoint', () => {
    const svc = buildSvc();
    const out = svc.previewPlanChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: midPeriod,
      currentSeats: 10,
      newSeats: 5,
      currentPlanCode: 'team',
      newPlanCode: 'pro',
      rateCard,
    });
    // New prorated = 5 × 2000 × 0.5 = 5000
    // Old prorated = 10 × 3000 × 0.5 = 15000
    // Net proration = -10000 (credit)
    expect(out.prorationCents).toBe(-10000);
  });

  it('throws when the rate card is missing an entry', () => {
    const svc = buildSvc();
    expect(() =>
      svc.previewPlanChange({
        currentPeriodStart: start,
        currentPeriodEnd: end,
        asOf: midPeriod,
        currentSeats: 5,
        newSeats: 6,
        currentPlanCode: 'pro',
        newPlanCode: 'business',
        rateCard: { ...rateCard, business: undefined as unknown as IPlanRate },
      })
    ).toThrow(/missing rate for plan/);
  });

  it('throws on currency mismatch between current and new plan rates', () => {
    const svc = buildSvc();
    expect(() =>
      svc.previewPlanChange({
        currentPeriodStart: start,
        currentPeriodEnd: end,
        asOf: midPeriod,
        currentSeats: 5,
        newSeats: 6,
        currentPlanCode: 'pro',
        newPlanCode: 'business',
        rateCard: {
          ...rateCard,
          pro: RATE({ currency: 'EUR' }),
        },
      })
    ).toThrow(/currency mismatch/);
  });

  it('returns zero proration outside the period', () => {
    const svc = buildSvc();
    const out = svc.previewPlanChange({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      asOf: new Date('2027-01-01T00:00:00Z'),
      currentSeats: 5,
      newSeats: 8,
      currentPlanCode: 'pro',
      newPlanCode: 'business',
      rateCard,
    });
    expect(out.prorationCents).toBe(0);
    expect(out.noOp).toBe(false);
  });
});

describe('BillingProrationService.remainingSecondsInPeriod', () => {
  it('returns full period when asOf is at start', () => {
    const svc = buildSvc();
    const out = svc.remainingSecondsInPeriod(
      { currentPeriodStart: start, currentPeriodEnd: end },
      start
    );
    expect(out).toBe(30 * 86_400);
  });

  it('returns 0 when asOf is past period end', () => {
    const svc = buildSvc();
    const out = svc.remainingSecondsInPeriod(
      { currentPeriodStart: start, currentPeriodEnd: end },
      new Date('2027-01-01T00:00:00Z')
    );
    expect(out).toBe(0);
  });

  it('returns half period when asOf is at the midpoint', () => {
    const svc = buildSvc();
    const out = svc.remainingSecondsInPeriod(
      { currentPeriodStart: start, currentPeriodEnd: end },
      midPeriod
    );
    expect(out).toBe(15 * 86_400);
  });

  it('defaults to now() when asOf is omitted', () => {
    const svc = buildSvc();
    const out = svc.remainingSecondsInPeriod({
      currentPeriodStart: start,
      currentPeriodEnd: end,
    });
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(30 * 86_400);
  });

  it('handles asOf before start by returning the full period', () => {
    const svc = buildSvc();
    const out = svc.remainingSecondsInPeriod(
      { currentPeriodStart: start, currentPeriodEnd: end },
      new Date('2026-08-01T00:00:00Z')
    );
    expect(out).toBe(30 * 86_400);
  });
});
