/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { buildWebhookEventId, BillingAuthService } from './billing.auth.service';
import { BillingProrationService } from './billing-proration.service';

interface IMockSubTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockInvoiceTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockEventTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  subscription: IMockSubTable;
  invoice: IMockInvoiceTable;
  webhookEvent: IMockEventTable;
}

const buildPrisma = (): IMockPrisma => ({
  subscription: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      ...data,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    update: vi.fn(async ({ where, data }) => ({ organizationId: where.organizationId, ...data })),
    findUnique: vi.fn(async () => null),
  },
  invoice: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      ...data,
      issuedAt: data.issuedAt ?? new Date(),
      paidAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({
      externalInvoiceId: where.externalInvoiceId,
      ...data,
    })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  webhookEvent: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      ...data,
      receivedAt: new Date(),
      processedAt: null,
      processingError: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    findUnique: vi.fn(async () => null),
  },
});

const baseSubInput = {
  organizationId: 'o1',
  planCode: 'pro' as const,
  externalSubscriptionId: 'sub_ext_1',
  externalCustomerId: 'cus_1',
  currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
  seats: 3,
};

describe('BillingAuthService (Stage 32)', () => {
  let prisma: IMockPrisma;
  let svc: BillingAuthService;
  let dunning: {
    scheduleRecoverySteps: ReturnType<typeof vi.fn>;
    cancelOnRecovery: ReturnType<typeof vi.fn>;
    cancelOnHardCancel: ReturnType<typeof vi.fn>;
    getPlan: ReturnType<typeof vi.fn>;
    markStepExecuted: ReturnType<typeof vi.fn>;
    markStepCanceled: ReturnType<typeof vi.fn>;
    findDueSteps: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = buildPrisma();
    dunning = {
      scheduleRecoverySteps: vi.fn(async () => null),
      cancelOnRecovery: vi.fn(async () => null),
      cancelOnHardCancel: vi.fn(async () => null),
      getPlan: vi.fn(async () => null),
      markStepExecuted: vi.fn(async () => null),
      markStepCanceled: vi.fn(async () => null),
      findDueSteps: vi.fn(async () => []),
    };
    svc = new BillingAuthService(
      prisma as never,
      new BillingProrationService(),
      dunning as never
    );
  });

  describe('createSubscription', () => {
    it('creates a subscription', async () => {
      const out = await svc.createSubscription(baseSubInput);
      expect(out.organizationId).toBe('o1');
      expect(out.status).toBe('incomplete');
    });

    it('rejects duplicate org', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({ id: 'sub_old' });
      await expect(svc.createSubscription(baseSubInput)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicate external id', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce(null);
      prisma.subscription.findUnique.mockResolvedValueOnce({ id: 'sub_other' });
      await expect(svc.createSubscription(baseSubInput)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateSubscription', () => {
    it('updates plan + seats', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_1',
        organizationId: 'o1',
        planCode: 'free',
        status: 'active',
        externalSubscriptionId: 'sub_ext_1',
        externalCustomerId: 'cus_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 1,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.updateSubscription('o1', { planCode: 'team', seats: 5 });
      expect(out.planCode).toBe('team');
      expect(out.seats).toBe(5);
    });

    it('rejects invalid status transition', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_1',
        organizationId: 'o1',
        planCode: 'free',
        status: 'canceled',
        externalSubscriptionId: 'sub_ext_1',
        externalCustomerId: 'cus_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
        seats: 1,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await expect(svc.updateSubscription('o1', { status: 'active' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('throws when missing', async () => {
      await expect(svc.updateSubscription('missing', { seats: 2 })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('cancelSubscription', () => {
    it('immediate cancel sets canceledAt', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_1',
        organizationId: 'o1',
        planCode: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_ext_1',
        externalCustomerId: 'cus_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 1,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.cancelSubscription('o1', false);
      expect(out.status).toBe('canceled');
      expect(out.canceledAt).not.toBeNull();
    });

    it('at-period-end keeps canceledAt null', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_1',
        organizationId: 'o1',
        planCode: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_ext_1',
        externalCustomerId: 'cus_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 1,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.cancelSubscription('o1', true);
      expect(out.status).toBe('active');
      expect(out.canceledAt).toBeNull();
      expect(out.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('invoices', () => {
    it('creates an invoice', async () => {
      const out = await svc.createInvoice({
        subscriptionId: 'sub_1',
        externalInvoiceId: 'in_ext_1',
        amountCents: 1_200,
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      expect(out.status).toBe('open');
    });

    it('rejects duplicate invoice id', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'inv_old' });
      await expect(
        svc.createInvoice({
          subscriptionId: 'sub_1',
          externalInvoiceId: 'in_ext_1',
          amountCents: 1,
          periodStart: new Date(),
          periodEnd: new Date(),
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('marks an invoice paid', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({
        id: 'inv_1',
        subscriptionId: 'sub_1',
        externalInvoiceId: 'in_ext_1',
        amountCents: 100,
        currency: 'usd',
        status: 'open',
        issuedAt: new Date(),
        periodStart: new Date(),
        periodEnd: new Date(),
        paidAt: null,
      });
      const out = await svc.markInvoicePaid('in_ext_1');
      expect(out.status).toBe('paid');
      expect(out.paidAt).not.toBeNull();
    });

    it('rejects paying a paid invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({
        id: 'inv_1',
        subscriptionId: 'sub_1',
        externalInvoiceId: 'in_ext_1',
        amountCents: 100,
        currency: 'usd',
        status: 'paid',
        issuedAt: new Date(),
        periodStart: new Date(),
        periodEnd: new Date(),
        paidAt: new Date(),
      });
      await expect(svc.markInvoicePaid('in_ext_1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('receiveWebhook', () => {
    it('creates a new event on first sight', async () => {
      const out = await svc.receiveWebhook({
        externalEventId: 'evt_1',
        eventType: 'invoice.paid',
        payload: '{"id":"evt_1","data":{"x":1}}',
      });
      expect(out.alreadyProcessed).toBe(false);
      expect(out.payload).toEqual({ id: 'evt_1', data: { x: 1 } });
      expect(out.event.id).toBe(buildWebhookEventId('evt_1'));
    });

    it('returns the existing event on duplicate', async () => {
      const id = buildWebhookEventId('evt_1');
      prisma.webhookEvent.findUnique.mockResolvedValueOnce({
        id,
        externalEventId: 'evt_1',
        eventType: 'invoice.paid',
        payloadJson: '{"id":"evt_1"}',
        receivedAt: new Date(),
        processedAt: null,
        processingError: null,
      });
      const out = await svc.receiveWebhook({
        externalEventId: 'evt_1',
        eventType: 'invoice.paid',
        payload: '{"id":"evt_1"}',
      });
      expect(out.alreadyProcessed).toBe(false);
      expect(out.payload).toEqual({ id: 'evt_1' });
    });

    it('marks already-processed when processedAt is set', async () => {
      const id = buildWebhookEventId('evt_2');
      prisma.webhookEvent.findUnique.mockResolvedValueOnce({
        id,
        externalEventId: 'evt_2',
        eventType: 'invoice.paid',
        payloadJson: '{}',
        receivedAt: new Date(),
        processedAt: new Date(),
        processingError: null,
      });
      const out = await svc.receiveWebhook({
        externalEventId: 'evt_2',
        eventType: 'invoice.paid',
        payload: '{}',
      });
      expect(out.alreadyProcessed).toBe(true);
    });

    it('still records a malformed payload', async () => {
      const out = await svc.receiveWebhook({
        externalEventId: 'evt_bad',
        eventType: 'unknown',
        payload: 'not json',
      });
      expect(out.payload).toEqual({});
      expect(out.event.id).toBe(buildWebhookEventId('evt_bad'));
    });

    it('marks an event processed', async () => {
      const out = await svc.markWebhookProcessed({ id: 'webh_x' });
      expect(out.processedAt).not.toBeNull();
    });

    it('records a processing error', async () => {
      const out = await svc.markWebhookProcessed({ id: 'webh_y', error: 'boom' });
      expect(out.processingError).toBe('boom');
    });
  });

  describe('changeSeats (Phase 5.2)', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const end = new Date('2026-10-01T00:00:00Z');
    const midPeriod = new Date('2026-09-16T00:00:00Z');
    const baseSub = {
      id: 'sub_1',
      organizationId: 'o1',
      planCode: 'pro',
      status: 'active',
      externalSubscriptionId: 'sub_ext_1',
      externalCustomerId: 'cus_1',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      seats: 5,
      createdTime: start,
      updatedTime: start,
    };

    function mockSubscriptionActive(overrides: Partial<typeof baseSub> = {}) {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        ...baseSub,
        ...overrides,
        organizationId: 'o1',
      } as never);
    }

    it('rejects when subscription is missing', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce(null);
      await expect(
        svc.changeSeats({
          organizationId: 'unknown',
          deltaSeats: 2,
          rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        })
      ).rejects.toThrow(/subscription not found/);
    });

    it('rejects when subscription is canceled', async () => {
      mockSubscriptionActive({ status: 'canceled' });
      await expect(
        svc.changeSeats({
          organizationId: 'o1',
          deltaSeats: 2,
          rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        })
      ).rejects.toThrow(/cannot change seats\/plan/);
    });

    it('persists a +2 seat upgrade at the period midpoint and drafts an invoice', async () => {
      mockSubscriptionActive();
      const updatedSub = { ...baseSub, seats: 7 };
      prisma.subscription.update.mockResolvedValueOnce(updatedSub as never);
      const out = await svc.changeSeats({
        organizationId: 'o1',
        deltaSeats: 2,
        rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        asOf: midPeriod,
      });
      expect(out.preview.prorationCents).toBe(2000);
      expect(out.preview.noOp).toBe(false);
      expect(out.sub.seats).toBe(7);
      expect(out.invoice).not.toBeNull();
      expect(out.invoice?.amountCents).toBe(2000);
      expect(out.invoice?.status).toBe('draft');
      expect(out.invoice?.currency).toBe('USD');
      expect(out.invoice?.externalInvoiceId).toContain('seat_change');
    });

    it('issues no invoice when the change is a no-op (delta = 0)', async () => {
      mockSubscriptionActive();
      const updatedSub = { ...baseSub, seats: 5 };
      prisma.subscription.update.mockResolvedValueOnce(updatedSub as never);
      const out = await svc.changeSeats({
        organizationId: 'o1',
        deltaSeats: 0,
        rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
      });
      expect(out.preview.noOp).toBe(true);
      expect(out.invoice).toBeNull();
    });

    it('credits the customer when deltaSeats is negative', async () => {
      mockSubscriptionActive();
      const updatedSub = { ...baseSub, seats: 3 };
      prisma.subscription.update.mockResolvedValueOnce(updatedSub as never);
      const out = await svc.changeSeats({
        organizationId: 'o1',
        deltaSeats: -2,
        rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        asOf: midPeriod,
      });
      expect(out.preview.prorationCents).toBe(-2000);
      expect(out.invoice?.amountCents).toBe(2000); // absolute value on the draft
    });

    it('treats a duplicate idempotencyKey as already-applied', async () => {
      mockSubscriptionActive();
      const dupInvoice = {
        id: 'inv_dup',
        subscriptionId: 'sub_1',
        externalInvoiceId: 'seat_change:o1:k1',
        amountCents: 2000,
        currency: 'USD',
        status: 'draft',
        issuedAt: new Date(),
        periodStart: start,
        periodEnd: end,
        paidAt: null,
      };
      prisma.invoice.findUnique.mockResolvedValueOnce(dupInvoice as never);
      prisma.subscription.findUnique.mockResolvedValueOnce({
        ...baseSub,
        seats: 7,
      } as never);
      const out = await svc.changeSeats({
        organizationId: 'o1',
        deltaSeats: 2,
        rate: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        idempotencyKey: 'k1',
      });
      expect(out.invoice?.id).toBe('inv_dup');
      // No second subscription.update / invoice.create call was made.
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('changePlan (Phase 5.2)', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const end = new Date('2026-10-01T00:00:00Z');
    const midPeriod = new Date('2026-09-16T00:00:00Z');
    const baseSub = {
      id: 'sub_1',
      organizationId: 'o1',
      planCode: 'pro',
      status: 'active',
      externalSubscriptionId: 'sub_ext_1',
      externalCustomerId: 'cus_1',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      seats: 5,
      createdTime: start,
      updatedTime: start,
    };

    const rateCard = {
      free: { monthlyPriceCentsPerSeat: 0, currency: 'USD' },
      pro: { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
      team: { monthlyPriceCentsPerSeat: 3000, currency: 'USD' },
      business: { monthlyPriceCentsPerSeat: 4000, currency: 'USD' },
      enterprise: { monthlyPriceCentsPerSeat: 5000, currency: 'USD' },
    } as const;

    function mockSubscriptionActive(overrides: Partial<typeof baseSub> = {}) {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        ...baseSub,
        ...overrides,
        organizationId: 'o1',
      } as never);
    }

    it('persists an upsell pro 5 → business 8 at the midpoint and drafts an invoice', async () => {
      mockSubscriptionActive();
      const updatedSub = { ...baseSub, planCode: 'business', seats: 8 };
      prisma.subscription.update.mockResolvedValueOnce(updatedSub as never);
      const out = await svc.changePlan({
        organizationId: 'o1',
        newSeats: 8,
        newPlanCode: 'business',
        rateCard,
        asOf: midPeriod,
      });
      // New prorated = 8 × 4000 × 0.5 = 16000
      // Old prorated = 5 × 2000 × 0.5 = 5000
      // Net proration = 11000
      expect(out.preview.prorationCents).toBe(11000);
      expect(out.sub.planCode).toBe('business');
      expect(out.sub.seats).toBe(8);
      expect(out.invoice?.amountCents).toBe(11000);
      expect(out.invoice?.externalInvoiceId).toContain('plan_change');
    });

    it('rejects when rateCard is missing entries', async () => {
      mockSubscriptionActive();
      await expect(
        svc.changePlan({
          organizationId: 'o1',
          newSeats: 7,
          newPlanCode: 'business',
          rateCard: {
            ...rateCard,
            business: undefined as unknown as (typeof rateCard)['business'],
          },
        })
      ).rejects.toThrow(/missing rate for plan/);
    });

    it('treats same-plan same-seats as a no-op (no row write, no invoice)', async () => {
      mockSubscriptionActive();
      const out = await svc.changePlan({
        organizationId: 'o1',
        newSeats: 5,
        newPlanCode: 'pro',
        rateCard,
      });
      expect(out.preview.noOp).toBe(true);
      expect(out.invoice).toBeNull();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('credits the customer when downgrading team 10 → pro 5', async () => {
      mockSubscriptionActive({ planCode: 'team', seats: 10 });
      const updatedSub = { ...baseSub, planCode: 'pro', seats: 5 };
      prisma.subscription.update.mockResolvedValueOnce(updatedSub as never);
      const out = await svc.changePlan({
        organizationId: 'o1',
        newSeats: 5,
        newPlanCode: 'pro',
        rateCard,
        asOf: midPeriod,
      });
      expect(out.preview.prorationCents).toBe(-10000);
      expect(out.invoice?.amountCents).toBe(10000); // absolute value
    });
  });

  describe('previewSeatChange / previewPlanChange (read-only)', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const end = new Date('2026-10-01T00:00:00Z');
    const sub = {
      id: 'sub_1',
      organizationId: 'o1',
      planCode: 'pro',
      status: 'active',
      externalSubscriptionId: 'sub_ext_1',
      externalCustomerId: 'cus_1',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      seats: 5,
      createdTime: start,
      updatedTime: start,
    } as const;

    it('previewSeatChange returns pure math without DB writes', () => {
      const out = svc.previewSeatChange(
        sub,
        2,
        { monthlyPriceCentsPerSeat: 2000, currency: 'USD' },
        new Date('2026-09-16T00:00:00Z')
      );
      expect(out.prorationCents).toBe(2000);
      expect(out.noOp).toBe(false);
      // No persistence happens for a preview call.
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('dunning hooks (Phase 5.3 part 1)', () => {
    const startDate = new Date('2026-09-01T00:00:00Z');
    const endDate = new Date('2026-10-01T00:00:00Z');

    it('schedules recovery when updateSubscription transitions into past_due', async () => {
      const sub = {
        id: 'sub_a',
        organizationId: 'o_a',
        planCode: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_ext_a',
        externalCustomerId: 'cus_a',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 3,
        createdTime: startDate,
        updatedTime: startDate,
      };
      prisma.subscription.findUnique
        .mockResolvedValueOnce(sub)
        .mockResolvedValueOnce({ ...sub, status: 'past_due' });
      prisma.subscription.update.mockResolvedValueOnce({ ...sub, status: 'past_due' });

      await svc.updateSubscription('o_a', { status: 'past_due' });

      expect(dunning.scheduleRecoverySteps).toHaveBeenCalledTimes(1);
      expect(dunning.scheduleRecoverySteps).toHaveBeenCalledWith({
        subscriptionId: 'o_a',
        reason: 'status_transition:active->past_due',
      });
      expect(dunning.cancelOnRecovery).not.toHaveBeenCalled();
      expect(dunning.cancelOnHardCancel).not.toHaveBeenCalled();
    });

    it('closes the plan as recovered when updateSubscription leaves past_due for active', async () => {
      const sub = {
        id: 'sub_b',
        organizationId: 'o_b',
        planCode: 'pro',
        status: 'past_due',
        externalSubscriptionId: 'sub_ext_b',
        externalCustomerId: 'cus_b',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 3,
        createdTime: startDate,
        updatedTime: startDate,
      };
      prisma.subscription.findUnique
        .mockResolvedValueOnce(sub)
        .mockResolvedValueOnce({ ...sub, status: 'active' });
      prisma.subscription.update.mockResolvedValueOnce({ ...sub, status: 'active' });

      await svc.updateSubscription('o_b', { status: 'active' });

      expect(dunning.cancelOnRecovery).toHaveBeenCalledTimes(1);
      expect(dunning.cancelOnRecovery).toHaveBeenCalledWith({ subscriptionId: 'o_b' });
      expect(dunning.cancelOnHardCancel).not.toHaveBeenCalled();
      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
    });

    it('closes the plan as completed when updateSubscription cancels from past_due', async () => {
      const sub = {
        id: 'sub_c',
        organizationId: 'o_c',
        planCode: 'pro',
        status: 'past_due',
        externalSubscriptionId: 'sub_ext_c',
        externalCustomerId: 'cus_c',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 3,
        createdTime: startDate,
        updatedTime: startDate,
      };
      prisma.subscription.findUnique
        .mockResolvedValueOnce(sub)
        .mockResolvedValueOnce({ ...sub, status: 'canceled' });
      prisma.subscription.update.mockResolvedValueOnce({ ...sub, status: 'canceled' });

      await svc.updateSubscription('o_c', { status: 'canceled' });

      expect(dunning.cancelOnHardCancel).toHaveBeenCalledTimes(1);
      expect(dunning.cancelOnHardCancel).toHaveBeenCalledWith({ subscriptionId: 'o_c' });
      expect(dunning.cancelOnRecovery).not.toHaveBeenCalled();
    });

    it('cancelSubscription(..., false) routes through the dunning hook', async () => {
      const sub = {
        id: 'sub_d',
        organizationId: 'o_d',
        planCode: 'pro',
        status: 'past_due',
        externalSubscriptionId: 'sub_ext_d',
        externalCustomerId: 'cus_d',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 3,
        createdTime: startDate,
        updatedTime: startDate,
      };
      prisma.subscription.findUnique
        .mockResolvedValueOnce(sub)
        .mockResolvedValueOnce({ ...sub, status: 'canceled' });
      prisma.subscription.update.mockResolvedValueOnce({ ...sub, status: 'canceled' });

      await svc.cancelSubscription('o_d', false);

      expect(dunning.cancelOnHardCancel).toHaveBeenCalledTimes(1);
      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
    });

    it('does not touch the dunning service for non-status updates', async () => {
      const sub = {
        id: 'sub_e',
        organizationId: 'o_e',
        planCode: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_ext_e',
        externalCustomerId: 'cus_e',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        seats: 3,
        createdTime: startDate,
        updatedTime: startDate,
      };
      prisma.subscription.findUnique.mockResolvedValueOnce(sub);
      prisma.subscription.update.mockResolvedValueOnce({ ...sub, seats: 5 });

      await svc.updateSubscription('o_e', { seats: 5 });

      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
      expect(dunning.cancelOnRecovery).not.toHaveBeenCalled();
      expect(dunning.cancelOnHardCancel).not.toHaveBeenCalled();
    });

    it('receiveWebhook schedules dunning when a past_due customer.subscription.updated arrives', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        organizationId: 'o_w',
        status: 'active',
        externalSubscriptionId: 'sub_ext_w',
      });

      await svc.receiveWebhook({
        externalEventId: 'evt_past_due',
        eventType: 'customer.subscription.updated',
        payload: JSON.stringify({
          data: { object: { id: 'sub_ext_w', status: 'past_due' } },
        }),
      });

      expect(dunning.scheduleRecoverySteps).toHaveBeenCalledTimes(1);
      expect(dunning.scheduleRecoverySteps).toHaveBeenCalledWith({
        subscriptionId: 'o_w',
        reason: 'customer.subscription.updated',
      });
    });

    it('receiveWebhook cancels the plan when a recovery event arrives', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        organizationId: 'o_r',
        status: 'past_due',
        externalSubscriptionId: 'sub_ext_r',
      });

      await svc.receiveWebhook({
        externalEventId: 'evt_recovered',
        eventType: 'customer.subscription.updated',
        payload: JSON.stringify({
          data: { object: { id: 'sub_ext_r', status: 'active' } },
        }),
      });

      expect(dunning.cancelOnRecovery).toHaveBeenCalledTimes(1);
      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
    });

    it('receiveWebhook silently ignores payloads that do not change status', async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        organizationId: 'o_x',
        status: 'active',
        externalSubscriptionId: 'sub_ext_x',
      });

      await svc.receiveWebhook({
        externalEventId: 'evt_noop',
        eventType: 'customer.subscription.updated',
        payload: JSON.stringify({
          data: { object: { id: 'sub_ext_x', status: 'active' } },
        }),
      });

      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
      expect(dunning.cancelOnRecovery).not.toHaveBeenCalled();
    });

    it('receiveWebhook ignores non-subscription event types', async () => {
      await svc.receiveWebhook({
        externalEventId: 'evt_invoice_paid',
        eventType: 'invoice.paid',
        payload: JSON.stringify({
          data: { object: { id: 'inv_1', status: 'past_due' } },
        }),
      });

      expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
      expect(dunning.scheduleRecoverySteps).not.toHaveBeenCalled();
    });
  });
});
