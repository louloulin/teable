/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — dunning worker (Phase 5.3 part 2, Stage 85).
 *
 * Picks up `BillingDunningStep` rows whose `dueAt` has elapsed and
 * executes the side-effect implied by the step kind:
 *
 *   T1_DUNNING_EMAIL    send a friendly reminder to org billing contacts (live)
 *   T2_DUNNING_RETRY    look up open invoice + call Stripe smart-retry (live when STRIPE_SECRET_KEY is set)
 *   T3_FINAL_NOTICE     send a last-chance email to org admins (live)
 *   T14_CANCEL          hard-cancel the subscription and revoke entitlement
 *
 * Round 43: T2_DUNNING_RETRY was promoted from a stub to a live path —
 * it now resolves the subscription's open invoice from the local `invoice`
 * table and calls `POST /v1/invoices/<id>/pay` whenever Stripe is
 * configured. When the Stripe secret key is missing (OSS / self-hosted
 * without Stripe), the handler still runs the invoice lookup so the audit
 * trail records which invoice would have been retried, and surfaces a
 * `stripeAttempted: false` flag. T14_CANCEL is fully wired: it calls
 * `BillingAuthService.cancelSubscription`, which itself triggers the
 * `cancelOnHardCancel` side-effect that cancels every still-scheduled
 * step inside the plan (including the T14 step that just fired).
 *
 * Failure handling: a handler exception leaves the step `scheduled` so
 * the next tick retries. Errors are returned in `processDueSteps` so a
 * cron wrapper can surface them to logs / alerting.
 *
 * License: AGPL-3.0
 */
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { BillingAuthService } from './billing.auth.service';
import {
  BillingDunningService,
  type DunningStepKind,
  type IDunningStep,
} from './billing-dunning.service';
import { MailSenderService } from '../mail-sender/mail-sender.service';

export interface IProcessDueStepsInput {
  asOf?: Date;
  limit?: number;
}

export interface IProcessDueStepsError {
  stepId: string;
  kind: DunningStepKind;
  error: string;
}

export interface IProcessDueStepsResult {
  scanned: number;
  executed: number;
  skipped: number;
  errors: number;
  errorDetails: IProcessDueStepsError[];
}

/**
 * Default cron interval for the dunning worker — 5 minutes. Operators
 * can override via `BILLING_DUNNING_WORKER_INTERVAL_MS` (in ms,
 * minimum 1000) or disable the in-process worker entirely via
 * `BILLING_DUNNING_WORKER_DISABLED=1` (driven from an external
 * pg-boss / Sidekiq-style sidecar instead).
 */
export const DEFAULT_DUNNING_WORKER_INTERVAL_MS = 5 * 60 * 1000;

interface IStepHandlerContext {
  prisma: PrismaService;
  auth: BillingAuthService;
  mailSender: MailSenderService;
  /** Wall-clock for deterministic tests. Defaults to `new Date()`. */
  now: Date;
  /** Stripe secret key resolved at tick time. Empty string when OSS / no key. */
  stripeSecretKey: string;
}

type StepHandler = (step: IDunningStep, ctx: IStepHandlerContext) => Promise<unknown>;

@Injectable()
export class BillingDunningWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingDunningWorkerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: BillingDunningService,
    private readonly auth: BillingAuthService,
    private readonly mailSender: MailSenderService
  ) {}

  onModuleInit(): void {
    if (process.env.BILLING_DUNNING_WORKER_DISABLED === '1') {
      this.logger.log('dunning worker disabled by env');
      return;
    }
    const envMs = process.env.BILLING_DUNNING_WORKER_INTERVAL_MS;
    const parsed = envMs ? Number(envMs) : NaN;
    const intervalMs =
      Number.isFinite(parsed) && parsed >= 1000
        ? parsed
        : DEFAULT_DUNNING_WORKER_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) =>
        this.logger.error(
          `dunning tick failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }, intervalMs);
    // Avoid keeping the process alive purely for the worker (tests,
    // graceful shutdown, etc.).
    this.timer.unref?.();
    this.logger.log(`dunning worker armed (intervalMs=${intervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Single tick: pull due steps and run them. Failures inside a single
   * handler are caught by `processDueSteps` (Round 14) and counted as
   * `errors`; we re-throw only for catastrophic failures (e.g. DB
   * unreachable) so the surrounding `setInterval` wrapper logs them
   * but the next tick still runs.
   */
  private async tick(): Promise<void> {
    const result = await this.processDueSteps({});
    if (result.executed > 0 || result.errors > 0) {
      this.logger.log(
        `dunning tick: scanned=${result.scanned} executed=${result.executed} errors=${result.errors}`
      );
    }
  }

  /**
   * Execute every step whose `dueAt <= asOf` and that is still
   * `scheduled`. Steps already `executed` or `canceled` are ignored
   * (the `findDueSteps` query filters them out upstream).
   *
   * The handler is responsible for any external side-effect. This
   * method only orchestrates: claim → write result → transition status.
   */
  async processDueSteps(input: IProcessDueStepsInput = {}): Promise<IProcessDueStepsResult> {
    const dueSteps = await this.dunning.findDueSteps({
      ...(input.asOf ? { asOf: input.asOf } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    });

    const ctx: IStepHandlerContext = {
      prisma: this.prisma,
      auth: this.auth,
      mailSender: this.mailSender,
      now: input.asOf ?? new Date(),
      stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    };

    let executed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: IProcessDueStepsError[] = [];

    for (const step of dueSteps) {
      const handler = HANDLERS[step.kind];
      if (!handler) {
        skipped += 1;
        continue;
      }
      try {
        const result = await handler(step, ctx);
        await this.dunning.recordStepResult({ stepId: step.id, result });
        await this.dunning.markStepExecuted({ stepId: step.id });
        executed += 1;
      } catch (err) {
        errors += 1;
        errorDetails.push({
          stepId: step.id,
          kind: step.kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      scanned: dueSteps.length,
      executed,
      skipped,
      errors,
      errorDetails,
    };
  }
}

// ─── Handlers ────────────────────────────────────────────────────────

const HANDLERS: Record<DunningStepKind, StepHandler> = {
  T1_DUNNING_EMAIL: sendReminderEmail,
  T2_DUNNING_RETRY: triggerStripeRetry,
  T3_FINAL_NOTICE: sendFinalNotice,
  T14_CANCEL: hardCancelSubscription,
};

/**
 * T+24h — friendly reminder to the org's billing contacts. Wires the
 * existing `MailSenderService.sendMail` so the email actually lands in
 * the admin's inbox (or is logged to the dev console when SMTP isn't
 * configured — `MailSenderService.sendMail` handles that case for us).
 *
 * Recipient resolution: query the `users` table for users with
 * `isAdmin=true` and a non-empty `email` belonging to the org. The
 * `billingDunningPlan.subscriptionId` column is the organizationId
 * (per Round 13) so we use that as the lookup key. If no admin emails
 * are configured, the handler returns an `email_skipped` marker so the
 * step is still marked executed — retrying without a recipient would
 * just be a tight loop.
 */
async function sendReminderEmail(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  const plan = await ctx.prisma.billingDunningPlan.findUnique({
    where: { id: step.planId },
  });
  if (!plan) throw new Error(`dunning plan vanished: ${step.planId}`);
  const recipients = await resolveBillingContacts(ctx.prisma, plan.subscriptionId);
  if (recipients.length === 0) {
    return {
      action: 'email_skipped',
      reason: 'no_billing_contacts',
      template: 'billing-dunning-reminder',
      organizationId: plan.subscriptionId,
      queuedAt: ctx.now.toISOString(),
    };
  }
  const subject = 'Payment reminder — your Teable subscription is past due';
  const sent = await ctx.mailSender.sendMail({
    to: recipients.join(','),
    subject,
    text: renderReminderText(plan.subscriptionId, ctx.now),
    html: renderReminderHtml(plan.subscriptionId, ctx.now),
  });
  return {
    action: 'email_sent',
    template: 'billing-dunning-reminder',
    organizationId: plan.subscriptionId,
    recipients,
    delivered: sent,
    queuedAt: ctx.now.toISOString(),
  };
}

/**
 * T+72h — re-attempt collection on the open invoice.
 *
 * Round 43 (Phase 5 T2 Stripe smart-retry):
 *
 *   1. Resolve the dunning plan's subscription (the plan's
 *      `subscriptionId` is the organizationId per Round 13).
 *   2. Look up the most recent `open` / `past_due` / `uncollectible`
 *      `Invoice` row for that subscription; we use the Stripe
 *      `externalInvoiceId` as the source of truth for retry.
 *   3. If `STRIPE_SECRET_KEY` is set (Cloud / SaaS deploy), call
 *      `POST https://api.stripe.com/v1/invoices/<id>/pay` to ask
 *      Stripe to retry the smart-collection. Stripe returns the
 *      updated invoice (`{ id, status, paid, ... }`) which we mirror
 *      into the audit trail.
 *   4. If the key is not set (OSS / self-hosted without Stripe), we
 *      keep emitting the `stripe_retry_triggered` marker so the audit
 *      log still records the attempt; the `stripeAttempted: false`
 *      flag tells operators the side-effect was a no-op.
 *   5. If no open invoice is found, return `no_open_invoice` so the
 *      worker doesn't loop forever waiting for an invoice to retry.
 *
 * The handler never throws for "expected" empty states; it only
 * throws on Stripe API errors (so the step stays `scheduled` and
 * the next tick retries) or on the dunning plan being missing.
 */
async function triggerStripeRetry(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  const plan = await ctx.prisma.billingDunningPlan.findUnique({
    where: { id: step.planId },
  });
  if (!plan) throw new Error(`dunning plan vanished: ${step.planId}`);

  // 1. Resolve the open / past_due invoice for this subscription.
  const openInvoice = await ctx.prisma.invoice.findFirst({
    where: {
      subscriptionId: plan.subscriptionId,
      status: { in: ['open', 'past_due', 'uncollectible'] },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const triggeredAt = ctx.now.toISOString();
  if (!openInvoice) {
    return {
      action: 'no_open_invoice',
      planId: step.planId,
      subscriptionId: plan.subscriptionId,
      triggeredAt,
      reason: 'no_open_or_past_due_invoice',
    };
  }

  // 2. OSS path — no Stripe key configured. Emit a richer marker so
  // operators can confirm the worker at least *looked up* the invoice.
  if (!ctx.stripeSecretKey) {
    return {
      action: 'stripe_retry_triggered',
      planId: step.planId,
      subscriptionId: plan.subscriptionId,
      externalInvoiceId: openInvoice.externalInvoiceId,
      invoiceStatus: openInvoice.status,
      triggeredAt,
      stripeAttempted: false,
      reason: 'STRIPE_SECRET_KEY not set',
    };
  }

  // 3. Cloud path — call Stripe `POST /v1/invoices/<id>/pay`.
  const params = new URLSearchParams();
  const res = await fetch(
    `https://api.stripe.com/v1/invoices/${encodeURIComponent(openInvoice.externalInvoiceId)}/pay`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Stripe retry failed for invoice=${openInvoice.externalInvoiceId} ` +
        `HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }
  let stripeInvoice: { id?: string; status?: string; paid?: boolean } = {};
  try {
    stripeInvoice = text ? (JSON.parse(text) as typeof stripeInvoice) : {};
  } catch {
    /* non-JSON response — leave stripeInvoice empty */
  }
  return {
    action: 'stripe_retry_succeeded',
    planId: step.planId,
    subscriptionId: plan.subscriptionId,
    externalInvoiceId: openInvoice.externalInvoiceId,
    invoiceStatus: openInvoice.status,
    stripeInvoiceStatus: stripeInvoice.status ?? null,
    stripePaid: stripeInvoice.paid ?? null,
    triggeredAt,
    stripeAttempted: true,
  };
}

/**
 * T+7d — final notice to org admins before the auto-cancel at T+14d.
 * Same recipient resolution as T1. Subject body and copy differ to
 * convey urgency; the dunning plan is still alive until T14 so the
 * copy points the reader at the billing portal to recover.
 */
async function sendFinalNotice(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  const plan = await ctx.prisma.billingDunningPlan.findUnique({
    where: { id: step.planId },
  });
  if (!plan) throw new Error(`dunning plan vanished: ${step.planId}`);
  const recipients = await resolveBillingContacts(ctx.prisma, plan.subscriptionId);
  if (recipients.length === 0) {
    return {
      action: 'email_skipped',
      reason: 'no_billing_contacts',
      template: 'billing-dunning-final',
      organizationId: plan.subscriptionId,
      queuedAt: ctx.now.toISOString(),
    };
  }
  const subject = 'Final notice — your Teable subscription will be canceled in 7 days';
  const sent = await ctx.mailSender.sendMail({
    to: recipients.join(','),
    subject,
    text: renderFinalText(plan.subscriptionId, ctx.now),
    html: renderFinalHtml(plan.subscriptionId, ctx.now),
  });
  return {
    action: 'email_sent',
    template: 'billing-dunning-final',
    organizationId: plan.subscriptionId,
    recipients,
    delivered: sent,
    queuedAt: ctx.now.toISOString(),
  };
}

/**
 * T+14d — hard-cancel the subscription. This is the only handler that
 * is fully wired in OSS because it has no external dependency beyond
 * `BillingAuthService`. After this runs, the
 * `dunningSideEffectOnStatusChange` hook inside `cancelSubscription`
 * flips every still-scheduled sibling step to `canceled` and closes the
 * plan as `completed`. The T14 step itself ends up `canceled` (not
 * `executed`) — `markStepExecuted` no-ops because the status is no
 * longer `scheduled`, which is exactly the audit shape we want.
 */
async function hardCancelSubscription(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  const plan = await ctx.prisma.billingDunningPlan.findUnique({
    where: { id: step.planId },
    include: { steps: true },
  });
  if (!plan) throw new Error(`dunning plan vanished: ${step.planId}`);

  // The plan's `subscriptionId` field stores the local subscription PK
  // here (the scheduler stores organizationId, but by the time we get to
  // T14 the local subscription row is required for the cancel call).
  // Resolve both so the caller can audit what happened.
  const sub = await ctx.prisma.subscription.findUnique({
    where: { organizationId: plan.subscriptionId },
  });
  if (!sub) {
    throw new Error(`subscription vanished for dunning plan ${step.planId}`);
  }

  // Cancel immediately (atPeriodEnd=false): the 14-day escalation has
  // already given the customer a full chance to pay.
  await ctx.auth.cancelSubscription(plan.subscriptionId, false);

  return {
    action: 'subscription_canceled',
    subscriptionId: sub.id,
    organizationId: plan.subscriptionId,
    canceledAt: ctx.now.toISOString(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Resolve billing contact emails for an org. The OSS query looks up
 * users with `isAdmin=true` and a non-empty email that belong to the
 * org. Cloud can replace this with a settings-driven contact list
 * without changing the call signature.
 */
async function resolveBillingContacts(
  prisma: PrismaService,
  organizationId: string
): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId,
      isAdmin: true,
      email: { not: '' },
      deletedTime: null,
    },
    select: { email: true },
    take: 5,
  });
  return rows.map((r) => r.email).filter((e): e is string => Boolean(e));
}

function renderReminderText(orgId: string, now: Date): string {
  return [
    'Your Teable subscription is past due.',
    '',
    `Organization: ${orgId}`,
    `Reminder sent: ${now.toISOString()}`,
    '',
    'Please update your payment method or settle the outstanding balance',
    'to keep your workspaces online. Visit your Customer Portal under',
    'Settings → Billing to recover the subscription.',
    '',
    '— Teable Billing',
  ].join('\n');
}

function renderReminderHtml(orgId: string, now: Date): string {
  return [
    '<p>Your Teable subscription is past due.</p>',
    `<p><strong>Organization:</strong> ${escapeHtml(orgId)}<br/>`,
    `<strong>Reminder sent:</strong> ${escapeHtml(now.toISOString())}</p>`,
    '<p>Please update your payment method or settle the outstanding balance',
    'to keep your workspaces online. Visit your Customer Portal under',
    'Settings &rarr; Billing to recover the subscription.</p>',
    '<p>&mdash; Teable Billing</p>',
  ].join('');
}

function renderFinalText(orgId: string, now: Date): string {
  return [
    'Final notice: your Teable subscription will be canceled in 7 days.',
    '',
    `Organization: ${orgId}`,
    `Notice sent: ${now.toISOString()}`,
    '',
    'This is the last reminder before automatic cancellation. To prevent',
    'loss of access, please update your payment method or settle the',
    'outstanding balance via your Customer Portal.',
    '',
    '— Teable Billing',
  ].join('\n');
}

function renderFinalHtml(orgId: string, now: Date): string {
  return [
    '<p><strong>Final notice:</strong> your Teable subscription will be canceled in 7 days.</p>',
    `<p><strong>Organization:</strong> ${escapeHtml(orgId)}<br/>`,
    `<strong>Notice sent:</strong> ${escapeHtml(now.toISOString())}</p>`,
    '<p>This is the last reminder before automatic cancellation. To prevent',
    'loss of access, please update your payment method or settle the',
    'outstanding balance via your Customer Portal.</p>',
    '<p>&mdash; Teable Billing</p>',
  ].join('');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
