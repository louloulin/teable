/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildInvoiceRow,
  buildSubscriptionRow,
  buildWebhookEventId,
  canAddSeats,
  computePlanAmount,
  isHandledEvent,
  isInvoiceTerminal,
  isValidInvoiceTransition,
  isValidSubscriptionTransition,
  parseEventPayload,
  resolvePlan,
  signWebhook,
  verifyWebhookSignature,
} from './billing.service';

describe('Billing helpers (Stage 32)', () => {
  describe('signWebhook / verifyWebhookSignature', () => {
    it('round-trips a valid signature', () => {
      const payload = '{"id":"evt_1","type":"invoice.paid"}';
      const t = 1_700_000_000;
      const sig = signWebhook({ secret: 'whsec_x', payload, timestamp: t });
      const r = verifyWebhookSignature({ header: sig, secret: 'whsec_x', payload, now: t });
      expect(r.valid).toBe(true);
      expect(r.reason).toBeNull();
    });

    it('rejects a missing header', () => {
      const r = verifyWebhookSignature({ header: null, secret: 'whsec_x', payload: '{}' });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('missing');
    });

    it('rejects a malformed header', () => {
      const r = verifyWebhookSignature({
        header: 'not-a-signature',
        secret: 'whsec_x',
        payload: '{}',
      });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('malformed');
    });

    it('rejects when the timestamp is too old', () => {
      const payload = '{"x":1}';
      const t = 1_700_000_000;
      const sig = signWebhook({ secret: 'whsec_x', payload, timestamp: t });
      const r = verifyWebhookSignature({
        header: sig,
        secret: 'whsec_x',
        payload,
        now: t + 60 * 60,
      });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('too-old');
    });

    it('rejects when the signature does not match', () => {
      const payload = '{"x":1}';
      const t = 1_700_000_000;
      const sig = signWebhook({ secret: 'whsec_x', payload, timestamp: t });
      const r = verifyWebhookSignature({ header: sig, secret: 'whsec_y', payload, now: t });
      expect(r.valid).toBe(false);
      expect(r.reason).toBe('mismatch');
    });
  });

  describe('parseEventPayload', () => {
    it('parses object', () => {
      expect(parseEventPayload('{"a":1}')).toEqual({ a: 1 });
    });
    it('returns null on non-object', () => {
      expect(parseEventPayload('[]')).toBeNull();
      expect(parseEventPayload('"x"')).toBeNull();
      expect(parseEventPayload('not json')).toBeNull();
    });
  });

  describe('resolvePlan / computePlanAmount / canAddSeats', () => {
    it('resolves known plans', () => {
      expect(resolvePlan('pro')?.displayName).toBe('Pro');
      expect(resolvePlan('unknown')).toBeNull();
    });

    it('computes base + per-seat addon', () => {
      const out = computePlanAmount({ planCode: 'pro', seats: 5, perSeatAddOnCents: 200 });
      expect(out).toBe(1_200 + 4 * 200);
    });

    it('returns 0 for unknown plan', () => {
      expect(computePlanAmount({ planCode: 'nope' as never, seats: 1 })).toBe(0);
    });

    it('respects seat limits', () => {
      const sub = buildSubscriptionRow({
        id: 'sub_1',
        organizationId: 'o1',
        planCode: 'pro',
        externalSubscriptionId: 'ext_1',
        externalCustomerId: 'cus_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        seats: 10,
      });
      expect(canAddSeats({ sub, requestedSeats: 20 })).toBe(true);
      expect(canAddSeats({ sub, requestedSeats: 21 })).toBe(false);
      expect(canAddSeats({ sub, requestedSeats: 5 })).toBe(true);
    });

    it('enterprise has no seat limit', () => {
      const sub = buildSubscriptionRow({
        id: 'sub_2',
        organizationId: 'o2',
        planCode: 'enterprise',
        externalSubscriptionId: 'ext_2',
        externalCustomerId: 'cus_2',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        seats: 5,
      });
      expect(canAddSeats({ sub, requestedSeats: 100_000 })).toBe(true);
    });
  });

  describe('status transitions', () => {
    it('subscription transitions', () => {
      expect(isValidSubscriptionTransition('incomplete', 'active')).toBe(true);
      expect(isValidSubscriptionTransition('active', 'canceled')).toBe(true);
      expect(isValidSubscriptionTransition('canceled', 'active')).toBe(false);
      expect(isValidSubscriptionTransition('past_due', 'unpaid')).toBe(true);
    });

    it('invoice transitions', () => {
      expect(isValidInvoiceTransition('open', 'paid')).toBe(true);
      expect(isValidInvoiceTransition('paid', 'void')).toBe(false);
      expect(isValidInvoiceTransition('uncollectible', 'paid')).toBe(true);
    });

    it('terminal invoice states', () => {
      expect(isInvoiceTerminal('paid')).toBe(true);
      expect(isInvoiceTerminal('open')).toBe(false);
    });
  });

  describe('build rows + apply', () => {
    it('buildSubscriptionRow defaults to incomplete', () => {
      const row = buildSubscriptionRow({
        id: 'sub_x',
        organizationId: 'o',
        planCode: 'pro',
        externalSubscriptionId: 'ext',
        externalCustomerId: 'cus',
        currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      });
      expect(row.status).toBe('incomplete');
      expect(row.seats).toBe(1);
    });

    it('buildInvoiceRow defaults to open', () => {
      const row = buildInvoiceRow({
        id: 'inv_x',
        subscriptionId: 'sub_x',
        externalInvoiceId: 'ext_inv',
        amountCents: 1200,
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      expect(row.status).toBe('open');
      expect(row.currency).toBe('usd');
    });
  });

  describe('webhook event dispatch + id', () => {
    it('marks handled event types', () => {
      expect(isHandledEvent('invoice.paid')).toBe(true);
      expect(isHandledEvent('charge.succeeded')).toBe(false);
    });

    it('builds a stable webhook id', () => {
      const a = buildWebhookEventId('evt_1');
      const b = buildWebhookEventId('evt_1');
      expect(a).toBe(b);
      const c = buildWebhookEventId('evt_2');
      expect(a).not.toBe(c);
      expect(a).toMatch(/^webh_[a-f0-9]+$/);
    });
  });
});
