/**
 * Stripe webhook reconciliation — pure helpers spec (Stage 83).
 */

import { createHmac } from 'node:crypto';

import {
  applyReconciledEntries,
  capEntries,
  dedupeEvents,
  isStripeEventKind,
  mapEventToAction,
  matchLineItem,
  reconcileInvoice,
  summarizeEntries,
  validateSignature,
} from './stripe-webhook.service';
import type {
  IInternalBillableLine,
  IReconciliationEntry,
  IStripeEvent,
  IStripeInvoice,
} from './stripe-webhook.types';
import { MAX_RECONCILIATION_ENTRIES } from './stripe-webhook.types';

describe('stripe-webhook.isStripeEventKind', () => {
  it('accepts', () => {
    expect(isStripeEventKind('invoice.paid')).toBe(true);
    expect(isStripeEventKind('charge.refunded')).toBe(true);
  });
  it('rejects', () => {
    expect(isStripeEventKind('??')).toBe(false);
  });
});

describe('stripe-webhook.validateSignature', () => {
  const secret = 'whsec_test';
  const ts = 1_700_000_000;
  const payload = '{"id":"evt_1"}';
  const goodSig = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');

  it('accepts valid sig', () => {
    expect(
      validateSignature({
        payload,
        signature: goodSig,
        timestamp: ts,
        secret,
        nowSeconds: ts,
      })
    ).toBe(true);
  });
  it('rejects bad sig', () => {
    expect(
      validateSignature({
        payload,
        signature: 'a'.repeat(64),
        timestamp: ts,
        secret,
        nowSeconds: ts,
      })
    ).toBe(false);
  });
  it('rejects stale timestamp', () => {
    expect(
      validateSignature({
        payload,
        signature: goodSig,
        timestamp: ts,
        secret,
        nowSeconds: ts + 10_000,
      })
    ).toBe(false);
  });
});

describe('stripe-webhook.mapEventToAction', () => {
  it('apply', () => {
    expect(mapEventToAction('invoice.paid')).toBe('apply');
    expect(mapEventToAction('payment_intent.succeeded')).toBe('apply');
  });
  it('reverse', () => {
    expect(mapEventToAction('charge.refunded')).toBe('reverse');
    expect(mapEventToAction('invoice.payment_failed')).toBe('reverse');
  });
  it('noop', () => {
    expect(mapEventToAction('invoice.finalized')).toBe('noop');
    expect(mapEventToAction('customer.subscription.updated')).toBe('noop');
  });
});

describe('stripe-webhook.matchLineItem', () => {
  it('matches within tolerance', () => {
    expect(matchLineItem({ expectedCents: 100, actualCents: 100 }).matched).toBe(true);
    expect(matchLineItem({ expectedCents: 100, actualCents: 101 }).matched).toBe(true);
  });
  it('mismatches beyond tolerance', () => {
    const out = matchLineItem({ expectedCents: 100, actualCents: 110 });
    expect(out.matched).toBe(false);
    expect(out.deltaCents).toBe(10);
  });
});

const sampleInvoice: IStripeInvoice = {
  id: 'in_1',
  customerId: 'cus_1',
  status: 'paid',
  totalCents: 300,
  lineItems: [
    {
      id: 'li_1',
      description: 'seats',
      amountCents: 100,
      quantity: 1,
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2026-01-31T00:00:00Z',
    },
    {
      id: 'li_2',
      description: 'storage',
      amountCents: 200,
      quantity: 1,
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2026-01-31T00:00:00Z',
    },
  ],
  createdAt: '2026-01-31T00:00:00Z',
};

const sampleInternal: IInternalBillableLine[] = [
  { id: 'a', invoiceId: 'in_1', lineItemId: 'li_1', cents: 100 },
  { id: 'b', invoiceId: 'in_1', lineItemId: 'li_2', cents: 200 },
];

describe('stripe-webhook.reconcileInvoice', () => {
  it('matches all', () => {
    const out = reconcileInvoice({
      eventId: 'evt_1',
      internalLines: sampleInternal,
      invoice: sampleInvoice,
    });
    expect(out.every((e) => e.status === 'matched')).toBe(true);
    expect(out.length).toBe(2);
  });
  it('mismatches when cents differ', () => {
    const out = reconcileInvoice({
      eventId: 'evt_1',
      internalLines: [
        { id: 'a', invoiceId: 'in_1', lineItemId: 'li_1', cents: 90 },
        { id: 'b', invoiceId: 'in_1', lineItemId: 'li_2', cents: 200 },
      ],
      invoice: sampleInvoice,
    });
    expect(out.find((e) => e.lineItemId === 'li_1')!.status).toBe('mismatch');
  });
  it('flags missing internal line', () => {
    const out = reconcileInvoice({
      eventId: 'evt_1',
      internalLines: [sampleInternal[0]!],
      invoice: sampleInvoice,
    });
    expect(
      out.some((e) => e.lineItemId === 'li_2' && e.reason === 'no matching internal line')
    ).toBe(true);
  });
  it('flags missing stripe line', () => {
    const out = reconcileInvoice({
      eventId: 'evt_1',
      internalLines: [
        ...sampleInternal,
        { id: 'c', invoiceId: 'in_1', lineItemId: 'li_orphan', cents: 50 },
      ],
      invoice: sampleInvoice,
    });
    expect(
      out.some((e) => e.lineItemId === 'li_orphan' && e.reason === 'no matching stripe line')
    ).toBe(true);
  });
});

describe('stripe-webhook.summarizeEntries', () => {
  it('counts', () => {
    const entries: IReconciliationEntry[] = [
      {
        id: '1',
        eventId: 'e',
        invoiceId: 'in_1',
        lineItemId: 'l1',
        status: 'matched',
        expectedCents: 100,
        actualCents: 100,
        deltaCents: 0,
      },
      {
        id: '2',
        eventId: 'e',
        invoiceId: 'in_1',
        lineItemId: 'l2',
        status: 'mismatch',
        expectedCents: 100,
        actualCents: 110,
        deltaCents: 10,
      },
    ];
    const out = summarizeEntries('in_1', entries);
    expect(out.matched).toBe(1);
    expect(out.mismatched).toBe(1);
    expect(out.totalDeltaCents).toBe(10);
  });
});

describe('stripe-webhook.applyReconciledEntries', () => {
  it('apply marks matched as applied', () => {
    const out = applyReconciledEntries({
      entries: [
        {
          id: '1',
          eventId: 'e',
          invoiceId: 'in_1',
          lineItemId: 'l1',
          status: 'matched',
          expectedCents: 100,
          actualCents: 100,
          deltaCents: 0,
        },
      ],
      now: '2026-01-31T00:00:00Z',
      action: 'apply',
    });
    expect(out[0]!.status).toBe('applied');
    expect(out[0]!.appliedAt).toBe('2026-01-31T00:00:00Z');
  });
  it('reverse returns applied to pending', () => {
    const out = applyReconciledEntries({
      entries: [
        {
          id: '1',
          eventId: 'e',
          invoiceId: 'in_1',
          lineItemId: 'l1',
          status: 'applied',
          expectedCents: 100,
          actualCents: 100,
          deltaCents: 0,
          appliedAt: '2026-01-30T00:00:00Z',
        },
      ],
      now: '2026-01-31T00:00:00Z',
      action: 'reverse',
    });
    expect(out[0]!.status).toBe('pending');
    expect(out[0]!.appliedAt).toBeUndefined();
  });
});

describe('stripe-webhook.dedupeEvents', () => {
  it('keeps existing when duplicate', () => {
    const event: IStripeEvent = {
      id: 'e1',
      kind: 'invoice.paid',
      createdAt: '2026-01-01T00:00:00Z',
      signature: 'sig',
      signatureTimestamp: 1,
    };
    const first = dedupeEvents({ existing: [], incoming: event });
    const second = dedupeEvents({ existing: first, incoming: event });
    expect(second.length).toBe(1);
  });
});

describe('stripe-webhook.capEntries', () => {
  it('caps to max', () => {
    const arr = Array.from({ length: MAX_RECONCILIATION_ENTRIES + 10 }, (_, i) => ({
      id: String(i),
      eventId: 'e',
      invoiceId: 'in',
      lineItemId: 'l',
      status: 'pending' as const,
      expectedCents: 0,
      actualCents: 0,
      deltaCents: 0,
    }));
    const out = capEntries(arr);
    expect(out.length).toBe(MAX_RECONCILIATION_ENTRIES);
  });
});
