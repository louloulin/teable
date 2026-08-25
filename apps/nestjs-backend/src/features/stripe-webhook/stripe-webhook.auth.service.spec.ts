/**
 * Stripe webhook reconciliation — NestJS auth service spec (Stage 83).
 */

import { createHmac } from 'node:crypto';

import { StripeWebhookAuthService } from './stripe-webhook.auth.service';

interface IPrismaMock {
  stripeWebhookEvent: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    create: (args: unknown) => Promise<unknown>;
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
      create: vi.fn().mockResolvedValue(undefined),
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
  it('dedupes existing event', async () => {
    const prisma = makePrisma();
    (prisma.stripeWebhookEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'evt_1',
        kind: 'invoice.paid',
        createdAt: new Date('2026-01-31T00:00:00Z'),
        signature: 'sig',
        signatureTimestamp: 1_700_000_000,
      },
    ]);
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
