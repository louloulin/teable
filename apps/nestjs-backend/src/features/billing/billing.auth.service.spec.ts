/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { buildWebhookEventId, BillingAuthService } from './billing.auth.service';

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

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new BillingAuthService(prisma as never);
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
      expect(out.status).toBe('canceled');
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
});
