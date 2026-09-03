/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — dunning worker (Phase 5.3 part 2, Stage 85).
 *
 * Picks up `BillingDunningStep` rows whose `dueAt` has elapsed and
 * executes the side-effect implied by the step kind:
 *
 *   T1_DUNNING_EMAIL    send a friendly reminder to org billing contacts
 *   T2_DUNNING_RETRY    trigger a Stripe smart-retry attempt on the open invoice
 *   T3_FINAL_NOTICE     send a last-chance email to org admins
 *   T14_CANCEL          hard-cancel the subscription and revoke entitlement
 *
 * Side-effects for the email/retry kinds are stubbed in OSS — they write
 * a structured `result` payload so the audit trail is preserved. Cloud
 * replaces the stubs with real `mail-sender` / Stripe calls behind the
 * same handler interface. T14_CANCEL is fully wired: it calls
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
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { BillingAuthService } from './billing.auth.service';
import {
  BillingDunningService,
  type DunningStepKind,
  type IDunningStep,
} from './billing-dunning.service';

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

interface IStepHandlerContext {
  prisma: PrismaService;
  auth: BillingAuthService;
  /** Wall-clock for deterministic tests. Defaults to `new Date()`. */
  now: Date;
}

type StepHandler = (step: IDunningStep, ctx: IStepHandlerContext) => Promise<unknown>;

@Injectable()
export class BillingDunningWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: BillingDunningService,
    private readonly auth: BillingAuthService
  ) {}

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
      now: input.asOf ?? new Date(),
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
 * T+24h — friendly reminder to the org's billing contacts. OSS stub:
 * returns a marker so the audit trail is preserved. Cloud replaces the
 * body with `MailSender.sendBillingReminder(orgId, step)`.
 */
async function sendReminderEmail(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  return {
    action: 'email_queued',
    template: 'billing-dunning-reminder',
    queuedAt: ctx.now.toISOString(),
    stub: true,
  };
}

/**
 * T+72h — re-attempt collection on the open invoice. OSS stub: emits
 * a marker. Cloud replaces with `Stripe.invoices.pay(invoiceId)` or a
 * smart-retry config patch.
 */
async function triggerStripeRetry(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  const plan = await ctx.prisma.billingDunningPlan.findUnique({
    where: { id: step.planId },
  });
  if (!plan) throw new Error(`dunning plan vanished: ${step.planId}`);
  return {
    action: 'stripe_retry_triggered',
    planId: step.planId,
    triggeredAt: ctx.now.toISOString(),
    stub: true,
  };
}

/**
 * T+7d — final notice to org admins before the auto-cancel at T+14d.
 * OSS stub. Cloud wires to MailSender with template
 * `billing-dunning-final`.
 */
async function sendFinalNotice(
  step: IDunningStep,
  ctx: IStepHandlerContext
): Promise<unknown> {
  return {
    action: 'email_queued',
    template: 'billing-dunning-final',
    queuedAt: ctx.now.toISOString(),
    stub: true,
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
