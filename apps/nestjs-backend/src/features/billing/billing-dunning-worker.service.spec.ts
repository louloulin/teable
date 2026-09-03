/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingDunningWorkerService } from './billing-dunning-worker.service';
import type {
  DunningStepKind,
  IDunningStep,
} from './billing-dunning.service';

interface IMockDunningSvc {
  findDueSteps: ReturnType<typeof vi.fn>;
  markStepExecuted: ReturnType<typeof vi.fn>;
  recordStepResult: ReturnType<typeof vi.fn>;
}

interface IMockAuthSvc {
  cancelSubscription: ReturnType<typeof vi.fn>;
}

interface IMockPrisma {
  billingDunningPlan: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  user: {
    findMany: ReturnType<typeof vi.fn>;
  };
  invoice: {
    findFirst: ReturnType<typeof vi.fn>;
  };
}

interface IMockMailSender {
  sendMail: ReturnType<typeof vi.fn>;
}

const buildStep = (overrides: Partial<IDunningStep> = {}): IDunningStep => ({
  id: overrides.id ?? 'duns_test',
  planId: overrides.planId ?? 'dunp_test',
  kind: overrides.kind ?? 'T1_DUNNING_EMAIL',
  status: overrides.status ?? 'scheduled',
  dueAt: overrides.dueAt ?? new Date('2026-01-02T00:00:00.000Z'),
  executedAt: overrides.executedAt ?? null,
  canceledAt: overrides.canceledAt ?? null,
  result: overrides.result ?? null,
  createdTime: overrides.createdTime ?? new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: overrides.updatedTime ?? new Date('2026-01-01T00:00:00.000Z'),
});

const buildPlan = (overrides: Partial<{ subscriptionId: string; status: 'active' | 'recovered' | 'completed' }> = {}) => ({
  id: 'dunp_test',
  subscriptionId: overrides.subscriptionId ?? 'org_test',
  status: overrides.status ?? 'active',
  reason: null,
  openedAt: new Date('2026-01-01T00:00:00.000Z'),
  resolvedAt: null,
  createdTime: new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: new Date('2026-01-01T00:00:00.000Z'),
  steps: [],
});

describe('BillingDunningWorkerService (Phase 5.3 part 2)', () => {
  let prisma: IMockPrisma;
  let dunning: IMockDunningSvc;
  let auth: IMockAuthSvc;
  let mail: IMockMailSender;
  let worker: BillingDunningWorkerService;

  beforeEach(() => {
    prisma = {
      billingDunningPlan: {
        findUnique: vi.fn(async () => buildPlan()),
      },
      subscription: {
        findUnique: vi.fn(async () => ({
          id: 'sub_test',
          organizationId: 'org_test',
        })),
      },
      user: {
        findMany: vi.fn(async () => []),
      },
      invoice: {
        // Default: return an open invoice. Tests override to null for
        // the 'no open invoice' branch.
        findFirst: vi.fn(async () => ({
          id: 'inv_test',
          subscriptionId: 'org_test',
          externalInvoiceId: 'in_stripe_test',
          status: 'open',
          amountCents: 4900,
          currency: 'usd',
        })),
      },
    };
    dunning = {
      findDueSteps: vi.fn(async () => []),
      markStepExecuted: vi.fn(async ({ stepId }: { stepId: string }) =>
        buildStep({ id: stepId, status: 'executed' })
      ),
      recordStepResult: vi.fn(async ({ stepId }: { stepId: string; result: unknown }) =>
        buildStep({ id: stepId, result: (stepId.length > 0 ? { ok: true } : null) as unknown })
      ),
    };
    auth = {
      cancelSubscription: vi.fn(async (organizationId: string) => ({
        id: 'sub_test',
        organizationId,
        status: 'canceled' as const,
      })),
    };
    mail = {
      sendMail: vi.fn(async () => true),
    };
    worker = new BillingDunningWorkerService(
      prisma as never,
      dunning as never,
      auth as never,
      mail as never
    );
  });

  describe('processDueSteps', () => {
    it('returns zeros when there are no due steps', async () => {
      const result = await worker.processDueSteps();
      expect(result).toEqual({
        scanned: 0,
        executed: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
      });
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('executes T1/T2/T3 stubs and records results', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t1', kind: 'T1_DUNNING_EMAIL' }),
        buildStep({ id: 'duns_t2', kind: 'T2_DUNNING_RETRY' }),
        buildStep({ id: 'duns_t3', kind: 'T3_FINAL_NOTICE' }),
      ]);

      const result = await worker.processDueSteps({ asOf: new Date('2026-01-15T00:00:00Z') });

      expect(result.scanned).toBe(3);
      expect(result.executed).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(dunning.recordStepResult).toHaveBeenCalledTimes(3);
      expect(dunning.markStepExecuted).toHaveBeenCalledTimes(3);

      // T1 (email) now actually sends via mail-sender
      const t1Result = dunning.recordStepResult.mock.calls[0][0].result;
      expect(t1Result).toMatchObject({
        action: 'email_skipped',
        reason: 'no_billing_contacts',
        template: 'billing-dunning-reminder',
      });
      // T2 (Stripe retry) R43 — OSS path: invoice lookup succeeds, but
      // STRIPE_SECRET_KEY is not set so the call is a no-op marker.
      const t2Result = dunning.recordStepResult.mock.calls[1][0].result;
      expect(t2Result).toMatchObject({
        action: 'stripe_retry_triggered',
        planId: 'dunp_test',
        subscriptionId: 'org_test',
        externalInvoiceId: 'in_stripe_test',
        invoiceStatus: 'open',
        stripeAttempted: false,
        reason: 'STRIPE_SECRET_KEY not set',
      });
      expect(t2Result).not.toHaveProperty('stub');
      // T3 (final email) skips when no contacts
      const t3Result = dunning.recordStepResult.mock.calls[2][0].result;
      expect(t3Result).toMatchObject({
        action: 'email_skipped',
        reason: 'no_billing_contacts',
        template: 'billing-dunning-final',
      });
    });

    it('executes T14_CANCEL by calling BillingAuthService.cancelSubscription', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce(
        buildPlan({ subscriptionId: 'org_xyz' })
      );
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_xyz',
        organizationId: 'org_xyz',
      });

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(1);
      expect(auth.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(auth.cancelSubscription).toHaveBeenCalledWith('org_xyz', false);

      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'subscription_canceled',
        subscriptionId: 'sub_xyz',
        organizationId: 'org_xyz',
      });
      expect(dunning.markStepExecuted).toHaveBeenCalledWith({ stepId: 'duns_t14' });
    });

    it('does not call cancelSubscription if the plan vanished', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce(null);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_t14',
        kind: 'T14_CANCEL',
        error: expect.stringContaining('vanished'),
      });
      expect(auth.cancelSubscription).not.toHaveBeenCalled();
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('does not call cancelSubscription if the subscription vanished', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.subscription.findUnique.mockResolvedValueOnce(null);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(auth.cancelSubscription).not.toHaveBeenCalled();
    });

    it('counts a step as skipped when no handler is registered for its kind', async () => {
      // Cast to bypass the exhaustive Record<…, …> typing for this edge case.
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_unknown', kind: 'UNKNOWN_KIND' as DunningStepKind }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.scanned).toBe(1);
      expect(result.executed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
    });

    it('leaves the step scheduled when the handler throws', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_fail', kind: 'T1_DUNNING_EMAIL' }),
      ]);
      // Force a handler error by making the dunning service throw on recordStepResult.
      dunning.recordStepResult.mockRejectedValueOnce(new Error('boom'));

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_fail',
        kind: 'T1_DUNNING_EMAIL',
        error: 'boom',
      });
      // markStepExecuted was never called because recordStepResult threw first.
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('processes a mixed batch and reports per-step outcomes', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_a', kind: 'T1_DUNNING_EMAIL' }),
        buildStep({ id: 'duns_b', kind: 'T14_CANCEL' }),
        buildStep({ id: 'duns_c', kind: 'T3_FINAL_NOTICE' }),
      ]);
      // Make the T3 step's handler throw by failing recordStepResult only
      // for its call.
      dunning.recordStepResult
        .mockResolvedValueOnce(buildStep({ id: 'duns_a' }))
        .mockResolvedValueOnce(buildStep({ id: 'duns_b' }))
        .mockRejectedValueOnce(new Error('mailer down'));

      const result = await worker.processDueSteps();

      expect(result.scanned).toBe(3);
      expect(result.executed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].stepId).toBe('duns_c');
      expect(auth.cancelSubscription).toHaveBeenCalledTimes(1);
    });

    it('passes the asOf / limit through to findDueSteps', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([]);
      const asOf = new Date('2026-02-01T00:00:00Z');
      await worker.processDueSteps({ asOf, limit: 7 });
      expect(dunning.findDueSteps).toHaveBeenCalledWith({ asOf, limit: 7 });
    });

    // ─── Real mail send (Round 33) ──────────────────────────────────

    it('T1 sends mail to org admin emails when contacts are configured', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { email: 'admin1@example.com' },
        { email: 'admin2@example.com' },
      ]);
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t1', kind: 'T1_DUNNING_EMAIL' }),
      ]);
      const result = await worker.processDueSteps();
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const mailArgs = mail.sendMail.mock.calls[0][0];
      expect(mailArgs.to).toBe('admin1@example.com,admin2@example.com');
      expect(mailArgs.subject).toContain('past due');
      expect(mailArgs.text).toContain('past due');
      expect(mailArgs.html).toContain('past due');
      expect(result.executed).toBe(1);
      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'email_sent',
        template: 'billing-dunning-reminder',
        organizationId: 'org_test',
        delivered: true,
        recipients: ['admin1@example.com', 'admin2@example.com'],
      });
    });

    it('T3 sends final notice to org admin emails', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { email: 'admin1@example.com' },
      ]);
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t3', kind: 'T3_FINAL_NOTICE' }),
      ]);
      const result = await worker.processDueSteps();
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const mailArgs = mail.sendMail.mock.calls[0][0];
      expect(mailArgs.subject).toContain('Final notice');
      expect(mailArgs.html).toContain('canceled');
      expect(result.executed).toBe(1);
      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'email_sent',
        template: 'billing-dunning-final',
      });
    });

    it('T1 skips with email_skipped when no admin emails are configured', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]); // no admins
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t1', kind: 'T1_DUNNING_EMAIL' }),
      ]);
      const result = await worker.processDueSteps();
      expect(mail.sendMail).not.toHaveBeenCalled();
      expect(result.executed).toBe(1);
      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'email_skipped',
        reason: 'no_billing_contacts',
      });
    });

    it('T1 fails (and retries next tick) when mail-sender throws', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ email: 'admin@example.com' }]);
      mail.sendMail.mockRejectedValueOnce(new Error('smtp down'));
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t1', kind: 'T1_DUNNING_EMAIL' }),
      ]);
      const result = await worker.processDueSteps();
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_t1',
        kind: 'T1_DUNNING_EMAIL',
        error: expect.stringContaining('smtp down'),
      });
      // markStepExecuted NOT called → step stays scheduled → retries next tick
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    // ─── Cron lifecycle (Round 34) ──────────────────────────────────

    it('R-DUNN-5: disabled env var → onModuleInit does not arm a timer', () => {
      process.env.BILLING_DUNNING_WORKER_DISABLED = '1';
      const setSpy = vi.spyOn(globalThis, 'setInterval');
      try {
        worker.onModuleInit();
        expect(setSpy).not.toHaveBeenCalled();
        expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
        worker.onModuleDestroy();
      } finally {
        setSpy.mockRestore();
        delete process.env.BILLING_DUNNING_WORKER_DISABLED;
      }
    });

    it('R-DUNN-6: enabled env arms a real interval and onModuleDestroy clears it', () => {
      delete process.env.BILLING_DUNNING_WORKER_DISABLED;
      process.env.BILLING_DUNNING_WORKER_INTERVAL_MS = '60000';
      const clearSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
      const setSpy = vi
        .spyOn(globalThis, 'setInterval')
        .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
      try {
        worker.onModuleInit();
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy.mock.calls[0]?.[1]).toBe(60000);
        worker.onModuleDestroy();
        expect(clearSpy).toHaveBeenCalledTimes(1);
      } finally {
        setSpy.mockRestore();
        clearSpy.mockRestore();
        delete process.env.BILLING_DUNNING_WORKER_INTERVAL_MS;
      }
    });

    it('R-DUNN-7: invalid env interval falls back to 5-minute default', () => {
      delete process.env.BILLING_DUNNING_WORKER_DISABLED;
      process.env.BILLING_DUNNING_WORKER_INTERVAL_MS = 'not-a-number';
      const setSpy = vi
        .spyOn(globalThis, 'setInterval')
        .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
      try {
        worker.onModuleInit();
        expect(setSpy.mock.calls[0]?.[1]).toBe(5 * 60 * 1000);
        worker.onModuleDestroy();
      } finally {
        setSpy.mockRestore();
        delete process.env.BILLING_DUNNING_WORKER_INTERVAL_MS;
      }
    });

    it('R-DUNN-8: sub-1s env interval is rejected and falls back to default', () => {
      delete process.env.BILLING_DUNNING_WORKER_DISABLED;
      process.env.BILLING_DUNNING_WORKER_INTERVAL_MS = '500';
      const setSpy = vi
        .spyOn(globalThis, 'setInterval')
        .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
      try {
        worker.onModuleInit();
        expect(setSpy.mock.calls[0]?.[1]).toBe(5 * 60 * 1000);
        worker.onModuleDestroy();
      } finally {
        setSpy.mockRestore();
        delete process.env.BILLING_DUNNING_WORKER_INTERVAL_MS;
      }
    });
  
// ─── Round 43 — T2 Stripe smart-retry enhancement ────────────────────────

  describe('T2_DUNNING_RETRY (R43 enhanced handler)', () => {
    beforeEach(() => {
      // Keep STRIPE_SECRET_KEY empty so OSS path runs by default.
      delete process.env.STRIPE_SECRET_KEY;
      // Stub fetch so any accidental Cloud-path call fails the test loudly.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('fetch should not be called in OSS path');
        })
      );
    });

    it('T2-R43-1: returns no_open_invoice when no open invoice is found', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t2_x', kind: 'T2_DUNNING_RETRY' }),
      ]);
      prisma.invoice.findFirst.mockResolvedValueOnce(null);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(1);
      expect(result.errors).toBe(0);
      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'no_open_invoice',
        planId: 'dunp_test',
        subscriptionId: 'org_test',
        reason: 'no_open_or_past_due_invoice',
      });
    });

    it('T2-R43-2: OSS path (no STRIPE_SECRET_KEY) returns enriched marker without calling Stripe', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t2_y', kind: 'T2_DUNNING_RETRY' }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(1);
      expect(result.errors).toBe(0);
      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'stripe_retry_triggered',
        externalInvoiceId: 'in_stripe_test',
        invoiceStatus: 'open',
        stripeAttempted: false,
        reason: 'STRIPE_SECRET_KEY not set',
      });
      // fetch must NOT have been called
      expect((fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it('T2-R43-3: Cloud path calls Stripe /v1/invoices/<id>/pay when STRIPE_SECRET_KEY is set', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
      const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'in_stripe_test',
            status: 'paid',
            paid: true,
          }),
      })) as unknown as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);

      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t2_z', kind: 'T2_DUNNING_RETRY' }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(1);
      expect(result.errors).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(String(calledUrl)).toBe(
        'https://api.stripe.com/v1/invoices/in_stripe_test/pay'
      );
      expect((calledInit as RequestInit).method).toBe('POST');
      const headers = (calledInit as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sk_test_xyz');

      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'stripe_retry_succeeded',
        externalInvoiceId: 'in_stripe_test',
        invoiceStatus: 'open',
        stripeInvoiceStatus: 'paid',
        stripePaid: true,
        stripeAttempted: true,
      });
    });

    it('T2-R43-4: Cloud path throws on Stripe 4xx so step stays scheduled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 402,
        text: async () => 'card_declined',
      })) as unknown as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);

      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t2_err', kind: 'T2_DUNNING_RETRY' }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_t2_err',
        kind: 'T2_DUNNING_RETRY',
      });
      expect(result.errorDetails[0].error).toMatch(/Stripe retry failed/);
      expect(result.errorDetails[0].error).toMatch(/HTTP 402/);
    });

    it('T2-R43-5: Cloud path throws on Stripe 5xx', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_xyz';
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'internal error',
      })) as unknown as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);

      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t2_5xx', kind: 'T2_DUNNING_RETRY' }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toMatch(/HTTP 500/);
    });
  });
});
});
