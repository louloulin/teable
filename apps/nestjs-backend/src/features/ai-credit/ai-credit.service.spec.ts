import {
  applyEntry,
  buildCheckResult,
  computeCarryover,
  monthBucketFromDate,
  monthBucketToStart,
  monthsBetween,
  summarizeMonth,
} from './ai-credit.service';
import type { IAiCreditEntry } from './ai-credit.types';

const entry = (over: Partial<IAiCreditEntry>): IAiCreditEntry => ({
  id: 'a',
  organizationId: 'org_1',
  action: 'charge',
  credits: 100,
  provider: null,
  sourceRef: null,
  monthBucket: '2026-08',
  createdTime: new Date('2026-08-01T00:00:00Z'),
  ...over,
});

describe('AI credit helpers (Stage 26)', () => {
  describe('monthBucketFromDate / monthBucketToStart', () => {
    it('formats YYYY-MM in UTC', () => {
      expect(monthBucketFromDate(new Date('2026-08-25T03:00:00Z'))).toBe('2026-08');
    });

    it('returns the first instant of the month in UTC', () => {
      const d = monthBucketToStart('2026-02');
      expect(d.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('throws on a malformed bucket', () => {
      expect(() => monthBucketToStart('2026-13')).toThrow();
      expect(() => monthBucketToStart('bad')).toThrow();
    });
  });

  describe('monthsBetween', () => {
    it('counts whole months between buckets', () => {
      expect(monthsBetween('2026-01', '2026-02')).toBe(1);
      expect(monthsBetween('2025-12', '2026-01')).toBe(1);
      expect(monthsBetween('2026-01', '2027-01')).toBe(12);
    });
  });

  describe('applyEntry', () => {
    it('returns a signed delta for each action', () => {
      expect(applyEntry(entry({ action: 'charge', credits: 200 }))).toBe(-200);
      expect(applyEntry(entry({ action: 'refund', credits: 200 }))).toBe(200);
      expect(applyEntry(entry({ action: 'grant', credits: 200 }))).toBe(200);
    });

    it('takes the absolute value (so negative inputs do not invert the sign)', () => {
      expect(applyEntry(entry({ action: 'charge', credits: -50 }))).toBe(-50);
    });
  });

  describe('summarizeMonth', () => {
    it('sums consumed, granted, net, chargeCount for the target bucket', () => {
      const usage = summarizeMonth(
        [
          entry({ id: '1', action: 'charge', credits: 100 }),
          entry({ id: '2', action: 'charge', credits: 50 }),
          entry({ id: '3', action: 'grant', credits: 500 }),
          entry({ id: '4', action: 'refund', credits: 30 }),
          entry({ id: '5', action: 'charge', credits: 999, monthBucket: '2026-09' }),
        ],
        '2026-08'
      );
      expect(usage.consumed).toBe(150);
      expect(usage.granted).toBe(530);
      expect(usage.net).toBe(380);
      expect(usage.chargeCount).toBe(2);
    });

    it('returns zeros when the month has no entries', () => {
      expect(summarizeMonth([], '2026-08')).toEqual({
        monthBucket: '2026-08',
        consumed: 0,
        granted: 0,
        net: 0,
        chargeCount: 0,
      });
    });
  });

  describe('buildCheckResult', () => {
    it('allows when consumption + estimate <= limit', () => {
      const r = buildCheckResult({
        organizationId: 'org_1',
        estimatedCredits: 200,
        limit: 1000,
        entries: [entry({ action: 'charge', credits: 300 })],
      });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(500);
      expect(r.consumed).toBe(300);
    });

    it('blocks when the estimate would exceed the limit', () => {
      const r = buildCheckResult({
        organizationId: 'org_1',
        estimatedCredits: 800,
        limit: 1000,
        entries: [entry({ action: 'charge', credits: 500 })],
      });
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(-300);
    });
  });

  describe('computeCarryover', () => {
    it('returns 0 when the previous month overshot', () => {
      const out = computeCarryover({
        currentBucket: '2026-08',
        prevUsage: {
          monthBucket: '2026-07',
          consumed: 1200,
          granted: 1000,
          net: -200,
          chargeCount: 5,
        },
        prevLimit: 1000,
        carryCap: 500,
      });
      expect(out.grantCredits).toBe(0);
    });

    it('caps the carry by the supplied cap', () => {
      const out = computeCarryover({
        currentBucket: '2026-08',
        prevUsage: {
          monthBucket: '2026-07',
          consumed: 100,
          granted: 1000,
          net: 900,
          chargeCount: 1,
        },
        prevLimit: 1000,
        carryCap: 200,
      });
      expect(out.grantCredits).toBe(200);
    });

    it('returns the unused balance when below the cap', () => {
      const out = computeCarryover({
        currentBucket: '2026-08',
        prevUsage: {
          monthBucket: '2026-07',
          consumed: 800,
          granted: 1000,
          net: 200,
          chargeCount: 4,
        },
        prevLimit: 1000,
        carryCap: 500,
      });
      expect(out.grantCredits).toBe(200);
    });

    it('handles year boundary (Dec → Jan)', () => {
      const out = computeCarryover({
        currentBucket: '2027-01',
        prevUsage: {
          monthBucket: '2026-12',
          consumed: 100,
          granted: 1000,
          net: 900,
          chargeCount: 1,
        },
        prevLimit: 1000,
        carryCap: 500,
      });
      expect(out.previousBucket).toBe('2026-12');
      expect(out.grantCredits).toBe(500);
    });

    it('returns 0 when prevUsage is for the wrong month', () => {
      const out = computeCarryover({
        currentBucket: '2026-08',
        prevUsage: {
          monthBucket: '2026-06',
          consumed: 0,
          granted: 1000,
          net: 1000,
          chargeCount: 0,
        },
        prevLimit: 1000,
        carryCap: 500,
      });
      expect(out.grantCredits).toBe(0);
    });
  });
});
