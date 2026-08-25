import {
  consolidateLineItems,
  decideDunningLevel,
  emptyByKind,
  exceedsCap,
  filterLineItems,
  isCurrency,
  isDunningLevel,
  isEmptyRollup,
  isLineKind,
  periodKey,
  rollupAllOrgs,
  sumCredits,
  toMajor,
  toMinor,
  validateLineItem,
} from './org-billing-rollup.service';
import type { IBillingCredit, IBillingLineItem, IBillingRollup } from './org-billing-rollup.types';
import {
  DEFAULT_PAST_DUE_30_DAYS,
  MAX_BASES_PER_ORG,
  MAX_LINE_ITEMS_PER_ROLLUP,
} from './org-billing-rollup.types';

const item = (over: Partial<IBillingLineItem> = {}): IBillingLineItem => ({
  id: 'li1',
  orgId: 'org1',
  baseId: 'base1',
  kind: 'subscription',
  incurredAt: '2026-01-15T00:00:00Z',
  quantity: 1,
  unitPriceMinor: 999,
  currency: 'USD',
  description: 'Pro plan',
  ...over,
});

const credit = (over: Partial<IBillingCredit> = {}): IBillingCredit => ({
  id: 'c1',
  orgId: 'org1',
  appliedAt: '2026-01-20T00:00:00Z',
  amountMinor: 500,
  currency: 'USD',
  reason: 'promo',
  ...over,
});

describe('org-billing-rollup.isLineKind', () => {
  it('accepts known kinds', () => {
    expect(isLineKind('subscription')).toBe(true);
    expect(isLineKind('ai-credit')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isLineKind('totally-bogus')).toBe(false);
  });
});

describe('org-billing-rollup.isCurrency', () => {
  it('accepts USD', () => {
    expect(isCurrency('USD')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isCurrency('XYZ')).toBe(false);
  });
});

describe('org-billing-rollup.isDunningLevel', () => {
  it('accepts canonical levels', () => {
    expect(isDunningLevel('past-due-30')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isDunningLevel('profit')).toBe(false);
  });
});

describe('org-billing-rollup.toMinor', () => {
  it('rounds half up', () => {
    expect(toMinor(0.005, 100)).toBe(1);
  });
  it('handles zero', () => {
    expect(toMinor(0, 100)).toBe(0);
  });
  it('rounds negatives toward zero', () => {
    expect(toMinor(10, -1)).toBe(-10);
  });
  it('returns 0 for NaN', () => {
    expect(toMinor(Number.NaN, 1)).toBe(0);
  });
});

describe('org-billing-rollup.toMajor', () => {
  it('divides by factor', () => {
    expect(toMajor(999, 'USD')).toBeCloseTo(9.99);
  });
  it('JPY uses factor 1', () => {
    expect(toMajor(1000, 'JPY')).toBe(1000);
  });
});

describe('org-billing-rollup.periodKey', () => {
  it('formats YYYY-MM with zero pad', () => {
    expect(periodKey('2026-03-05T00:00:00Z')).toBe('2026-03');
  });
  it('returns epoch for invalid', () => {
    expect(periodKey('not-a-date')).toBe('1970-01');
  });
});

describe('org-billing-rollup.validateLineItem', () => {
  it('passes a healthy item', () => {
    expect(validateLineItem(item())).toBeNull();
  });
  it('rejects bad kind', () => {
    expect(validateLineItem(item({ kind: 'totally-bogus' as never }))).toContain('kind');
  });
  it('rejects bad currency', () => {
    expect(validateLineItem(item({ currency: 'XYZ' as never }))).toContain('currency');
  });
  it('rejects negative quantity', () => {
    expect(validateLineItem(item({ quantity: -1 }))).toContain('quantity');
  });
  it('rejects negative unit price', () => {
    expect(validateLineItem(item({ unitPriceMinor: -1 }))).toContain('unitPriceMinor');
  });
  it('rejects missing id/baseId/orgId', () => {
    expect(validateLineItem(item({ id: '' }))).toContain('id');
    expect(validateLineItem(item({ baseId: '' }))).toContain('baseId');
    expect(validateLineItem(item({ orgId: '' }))).toContain('orgId');
  });
});

describe('org-billing-rollup.decideDunningLevel', () => {
  it('returns current at zero', () => {
    expect(decideDunningLevel({ daysPastDue: 0 })).toBe('current');
  });
  it('returns reminder within 30 days', () => {
    expect(decideDunningLevel({ daysPastDue: 10 })).toBe('reminder');
  });
  it('breaches past-due-30 at the threshold', () => {
    expect(decideDunningLevel({ daysPastDue: 30 })).toBe('past-due-30');
  });
  it('breaches past-due-60 at 60', () => {
    expect(decideDunningLevel({ daysPastDue: 60 })).toBe('past-due-60');
  });
  it('breaches past-due-90 at 90', () => {
    expect(decideDunningLevel({ daysPastDue: 90 })).toBe('past-due-90');
  });
  it('honors custom thresholds', () => {
    expect(decideDunningLevel({ daysPastDue: 5, options: { pastDue30Days: 4 } })).toBe(
      'past-due-30'
    );
  });
});

describe('org-billing-rollup.emptyByKind', () => {
  it('returns zeros for every kind', () => {
    const out = emptyByKind();
    expect(out.subscription).toBe(0);
    expect(out['ai-credit']).toBe(0);
  });
});

describe('org-billing-rollup.sumCredits', () => {
  it('sums credits matching org/period/currency', () => {
    const out = sumCredits({
      credits: [credit(), credit({ amountMinor: 200 })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(out).toBe(700);
  });
  it('skips wrong org', () => {
    const out = sumCredits({
      credits: [credit({ orgId: 'org2' })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(out).toBe(0);
  });
  it('skips wrong currency', () => {
    const out = sumCredits({
      credits: [credit({ currency: 'EUR' })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(out).toBe(0);
  });
});

describe('org-billing-rollup.filterLineItems', () => {
  it('returns matching items only', () => {
    const out = filterLineItems({
      items: [item(), item({ baseId: 'base2' }), item({ orgId: 'org2' })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(out.length).toBe(2);
  });
});

describe('org-billing-rollup.consolidateLineItems', () => {
  it('sums gross and subtracts credits', () => {
    const r = consolidateLineItems({
      items: [
        item({ kind: 'subscription', quantity: 1, unitPriceMinor: 1000 }),
        item({ id: 'li2', kind: 'ai-credit', quantity: 100, unitPriceMinor: 5 }),
      ],
      credits: [credit({ amountMinor: 200 })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(r.grossMinor).toBe(1500);
    expect(r.creditsMinor).toBe(200);
    expect(r.netMinor).toBe(1300);
    expect(r.lineCount).toBe(2);
    expect(r.byKind.subscription).toBe(1000);
    expect(r.byKind['ai-credit']).toBe(500);
  });
  it('clamps net at zero', () => {
    const r = consolidateLineItems({
      items: [item({ quantity: 1, unitPriceMinor: 100 })],
      credits: [credit({ amountMinor: 500 })],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(r.netMinor).toBe(0);
  });
  it('counts distinct bases', () => {
    const r = consolidateLineItems({
      items: [
        item({ baseId: 'b1' }),
        item({ id: 'li2', baseId: 'b2' }),
        item({ id: 'li3', baseId: 'b1' }),
      ],
      credits: [],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(r.baseCount).toBe(2);
  });
  it('caps baseCount at MAX_BASES_PER_ORG', () => {
    const items = Array.from({ length: MAX_BASES_PER_ORG + 5 }, (_, i) =>
      item({ id: `li${i}`, baseId: `b${i}` })
    );
    const r = consolidateLineItems({
      items,
      credits: [],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(r.baseCount).toBe(MAX_BASES_PER_ORG);
  });
  it('uses provided dunning level when daysPastDue given', () => {
    const r = consolidateLineItems({
      items: [item()],
      credits: [],
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
      daysPastDue: 45,
    });
    expect(r.dunningLevel).toBe('past-due-30');
  });
});

describe('org-billing-rollup.rollupAllOrgs', () => {
  it('produces a rollup per org/period/currency combination', () => {
    const out = rollupAllOrgs({
      items: [
        item({ orgId: 'org1' }),
        item({ id: 'li2', orgId: 'org2' }),
        item({ id: 'li3', orgId: 'org1', incurredAt: '2026-02-01T00:00:00Z' }),
      ],
      credits: [],
      now: '2026-02-15T00:00:00Z',
    });
    const keys = out.map((r) => `${r.orgId}|${r.period}|${r.currency}`);
    expect(keys).toContain('org1|2026-01|USD');
    expect(keys).toContain('org1|2026-02|USD');
    expect(keys).toContain('org2|2026-01|USD');
  });
});

describe('org-billing-rollup.isEmptyRollup', () => {
  it('returns true for empty rollup', () => {
    const r: IBillingRollup = {
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
      grossMinor: 0,
      creditsMinor: 0,
      netMinor: 0,
      lineCount: 0,
      baseCount: 0,
      dunningLevel: 'current',
      byKind: emptyByKind(),
      generatedAt: '',
    };
    expect(isEmptyRollup(r)).toBe(true);
  });
});

describe('org-billing-rollup.exceedsCap', () => {
  it('returns true when over the cap', () => {
    const items = Array.from({ length: MAX_LINE_ITEMS_PER_ROLLUP + 1 }, (_, i) =>
      item({ id: `li${i}` })
    );
    expect(exceedsCap({ items, orgId: 'org1', period: '2026-01' })).toBe(true);
  });
  it('returns false when under', () => {
    expect(exceedsCap({ items: [item()], orgId: 'org1', period: '2026-01' })).toBe(false);
  });
});

describe('org-billing-rollup default threshold values', () => {
  it('exposes 30/60/90 defaults', () => {
    expect(DEFAULT_PAST_DUE_30_DAYS).toBe(30);
  });
});
