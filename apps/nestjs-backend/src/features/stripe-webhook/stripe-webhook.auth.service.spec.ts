/**
 * Stripe webhook reconciliation — NestJS auth service spec (Stage 83).
 */

import { createHmac } from 'node:crypto';

import { StripeWebhookAuthService } from './stripe-webhook.auth.service';

interface IPrismaMock {
  stripeWebhookEvent: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    create: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  stripeReconciliationEntry: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  internalBillableLine: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    stripeWebhookEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stripeReconciliationEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    },
    internalBillableLine: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function buildSignedEvent(input: { id: string; secret: string; payload: string; ts: number }) {
  const sig = createHmac('sha256', input.secret)
    .update(`${input.ts}.${input.payload}`)
    .digest('hex');
  return {
    id: input.id,
    kind: 'invoice.paid' as const,
    createdAt: '2026-01-31T00:00:00Z',
    signature: sig,
    signatureTimestamp: input.ts,
    invoice: {
      id: 'in_1',
      customerId: 'cus_1',
      status: 'paid' as const,
      totalCents: 100,
      lineItems: [
        {
          id: 'li_1',
          description: 'seats',
          amountCents: 100,
          quantity: 1,
          periodStart: '2026-01-01T00:00:00Z',
          periodEnd: '2026-01-31T00:00:00Z',
        },
      ],
      createdAt: '2026-01-31T00:00:00Z',
    },
  };
}

describe('StripeWebhookAuthService.ingestEvent', () => {
  it('accepts valid sig and reconciles', async () => {
    const prisma = makePrisma();
    (prisma.internalBillableLine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a', invoiceId: 'in_1', lineItemId: 'li_1', cents: 100 },
    ]);
    const svc = new StripeWebhookAuthService(prisma as never);
    const ts = 1_700_000_000;
    const event = buildSignedEvent({
      id: 'evt_1',
      secret: 'whsec',
      payload: '{}',
      ts,
    });
    const out = await svc.ingestEvent({
      payload: '{}',
      event,
      secret: 'whsec',
      nowSeconds: ts,
      now: '2026-01-31T00:00:00Z',
    });
    expect(out).not.toBeNull();
    expect(out!.matched + out!.applied).toBe(1);
  });
  it('rejects bad sig', async () => {
    const svc = new StripeWebhookAuthService(makePrisma() as never);
    const ts = 1_700_000_000;
    const event = buildSignedEvent({ id: 'evt_1', secret: 'wrong', payload: '{}', ts });
    await expect(
      svc.ingestEvent({
        payload: '{}',
        event,
        secret: 'whsec',
        nowSeconds: ts,
        now: '2026-01-31T00:00:00Z',
      })
    ).rejects.toThrow(/signature/);
  });
  it('dedupes an already-succeeded event (returns null without retrying)', async () => {
    const prisma = makePrisma();
    (prisma.stripeWebhookEvent.create as ReturnType<typeof vi.fn>).mockRejectedValue({ code: 'P2002' });
    (prisma.stripeWebhookEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'evt_1',
      kind: 'invoice.paid',
      createdAt: new Date('2026-01-31T00:00:00Z'),
      invoiceId: 'in_1',
      signature: 'sig',
      signatureTimestamp: 1_700_000_000,
      status: 'succeeded',
      attempt: 1,
      maxAttempts: 5,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      processedAt: new Date(),
      lastError: null,
      errorCode: null,
    });
    const svc = new StripeWebhookAuthService(prisma as never);
    const ts = 1_700_000_000;
    const event = buildSignedEvent({ id: 'evt_1', secret: 'whsec', payload: '{}', ts });
    const out = await svc.ingestEvent({
      payload: '{}',
      event,
      secret: 'whsec',
      nowSeconds: ts,
      now: '2026-01-31T00:00:00Z',
    });
    expect(out).toBeNull();
    expect(prisma.stripeReconciliationEntry.create).not.toHaveBeenCalled();
  });

  it('reclaims an expired `processing` lease on replay', async () => {
    const prisma = makePrisma();
    (prisma.stripeWebhookEvent.create as ReturnType<typeof vi.fn>).mockRejectedValue({ code: 'P2002' });
    const inputNow = new Date('2026-01-31T00:00:00Z');
    const past = new Date(inputNow.getTime() - 60_000);
    (prisma.stripeWebhookEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'evt_2',
      kind: 'invoice.paid',
      createdAt: inputNow,
      invoiceId: 'in_1',
      signature: 'sig',
      signatureTimestamp: 1_700_000_000,
      status: 'processing',
      attempt: 1,
      maxAttempts: 5,
      heartbeatAt: past,
      leaseUntil: past,
      retryAt: null,
      processedAt: null,
      lastError: null,
      errorCode: null,
    });
    (prisma.internalBillableLine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a', invoiceId: 'in_1', lineItemId: 'li_1', cents: 100 },
    ]);
    (prisma.stripeWebhookEvent.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const svc = new StripeWebhookAuthService(prisma as never);
    const ts = 1_700_000_000;
    const event = buildSignedEvent({ id: 'evt_2', secret: 'whsec', payload: '{}', ts });
    const out = await svc.ingestEvent({
      payload: '{}',
      event,
      secret: 'whsec',
      nowSeconds: ts,
      now: inputNow.toISOString(),
    });
    expect(out).not.toBeNull();
    const calls = (
      prisma.stripeWebhookEvent.updateMany as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastClaim = calls[0]?.[0] as { data: Record<string, unknown> };
    expect(lastClaim.data).toMatchObject({ status: 'processing' });
  });

  it('transitions to `failed` (with retryAt) when reconcile throws and retries remain', async () => {
    const prisma = makePrisma();
    (prisma.internalBillableLine.findMany as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('db down');
    });
    (prisma.stripeWebhookEvent.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 1 }) // queued -> processing
      .mockResolvedValueOnce({ count: 1 }); // processing -> queued (retry)
    const svc = new StripeWebhookAuthService(prisma as never);
    const ts = 1_700_000_000;
    const event = buildSignedEvent({ id: 'evt_3', secret: 'whsec', payload: '{}', ts });
    await expect(
      svc.ingestEvent({
        payload: '{}',
        event,
        secret: 'whsec',
        nowSeconds: ts,
        now: '2026-01-31T00:00:00Z',
      })
    ).rejects.toThrow(/db down/);
    const calls = (
      prisma.stripeWebhookEvent.updateMany as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const failCall = calls[calls.length - 1]?.[0] as { data: Record<string, unknown> };
    expect(failCall.data).toMatchObject({
      status: 'queued',
      errorCode: 'TRANSIENT_PROCESSING_ERROR',
    });
    expect(failCall.data.retryAt).toBeInstanceOf(Date);
  });

  it('recoverExpiredEvents counts and resets rows whose leases expired', async () => {
    const prisma = makePrisma();
    (prisma.stripeWebhookEvent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 3 });
    const svc = new StripeWebhookAuthService(prisma as never);
    const out = await svc.recoverExpiredEvents();
    expect(out).toBe(3);
  });
});

describe('StripeWebhookAuthService.summaryFor', () => {
  it('returns zeros', async () => {
    const svc = new StripeWebhookAuthService(makePrisma() as never);
    const out = await svc.summaryFor('in_1');
    expect(out.matched).toBe(0);
    expect(out.mismatched).toBe(0);
  });
});

describe('StripeWebhookAuthService.listUnmatched', () => {
  it('returns empty', async () => {
    const svc = new StripeWebhookAuthService(makePrisma() as never);
    const out = await svc.listUnmatched('in_1');
    expect(out).toEqual([]);
  });
});

describe('StripeWebhookAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new StripeWebhookAuthService(makePrisma() as never);
    expect(typeof svc.validateSignature).toBe('function');
    expect(typeof svc.mapEventToAction).toBe('function');
    expect(typeof svc.reconcileInvoice).toBe('function');
    expect(typeof svc.summarizeEntries).toBe('function');
    expect(typeof svc.applyReconciledEntries).toBe('function');
    expect(typeof svc.dedupeEvents).toBe('function');
    expect(typeof svc.capEntries).toBe('function');
  });
});
