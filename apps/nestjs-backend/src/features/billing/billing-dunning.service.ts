import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

/**
 * Billing — dunning scheduler (Phase 5.3 part 1, Stage 84).
 *
 * Cloud parity: when a subscription enters `past_due`, open one
 * BillingDunningPlan and pre-schedule four recovery steps:
 *
 *   T+24h  T1_DUNNING_EMAIL    friendly reminder email
 *   T+72h  T2_DUNNING_RETRY    trigger Stripe smart-retry (invoice.payment_failed)
 *   T+7d   T3_FINAL_NOTICE     last-chance email to all org admins
 *   T+14d  T14_CANCEL          hard cancel + revoke entitlement
 *
 * Recovery to `active` (or any non-`past_due` state, including
 * `canceled`) flips every still-scheduled step to `canceled` and
 * closes the plan as `recovered` / `completed`. The step *executor*
 * (next round) scans `findDueSteps()` and atomically claims each row
 * by transitioning it to `executed` (or `canceled`).
 *
 * Why split scheduler and executor: durable scheduling is synchronous
 * (billed immediately when the webhook lands), while execution is
 * background and may crash / restart. Two services keep the hot path
 * in BillingAuthService cheap and let the worker stay stateless.
 *
 * License: AGPL-3.0
 */

export type DunningStepKind =
  | 'T1_DUNNING_EMAIL'
  | 'T2_DUNNING_RETRY'
  | 'T3_FINAL_NOTICE'
  | 'T14_CANCEL';

export type DunningStepStatus = 'scheduled' | 'executed' | 'canceled';
export type DunningPlanStatus = 'active' | 'recovered' | 'completed';

export interface IDunningStep {
  id: string;
  planId: string;
  kind: DunningStepKind;
  status: DunningStepStatus;
  dueAt: Date;
  executedAt: Date | null;
  canceledAt: Date | null;
  result: unknown;
  createdTime: Date;
  updatedTime: Date;
}

export interface IDunningPlan {
  id: string;
  subscriptionId: string;
  status: DunningPlanStatus;
  reason: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
  steps?: IDunningStep[];
}

export interface IScheduleRecoveryInput {
  subscriptionId: string;
  /** Free-form trigger (e.g. `payment_failed`, `manual`). Stored on the plan. */
  reason?: string;
  /** Defaults to now(). Provides deterministic offsets for tests. */
  asOf?: Date;
}

export interface IMarkStepExecutionInput {
  stepId: string;
  result?: unknown;
  executedAt?: Date;
}

const STEP_DEFINITIONS: ReadonlyArray<{ kind: DunningStepKind; offsetMs: number }> = [
  { kind: 'T1_DUNNING_EMAIL', offsetMs: 24 * 60 * 60 * 1000 },
  { kind: 'T2_DUNNING_RETRY', offsetMs: 72 * 60 * 60 * 1000 },
  { kind: 'T3_FINAL_NOTICE', offsetMs: 7 * 24 * 60 * 60 * 1000 },
  { kind: 'T14_CANCEL', offsetMs: 14 * 24 * 60 * 60 * 1000 },
];

const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class BillingDunningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Open a recovery plan and schedule all four steps. Idempotent: a
   * second call for the same subscription while a plan is still `active`
   * returns the existing plan untouched. Called by BillingAuthService
   * the moment Stripe reports `past_due`.
   */
  async scheduleRecoverySteps(input: IScheduleRecoveryInput): Promise<IDunningPlan> {
    const existing = await this.prisma.billingDunningPlan.findFirst({
      where: { subscriptionId: input.subscriptionId, status: 'active' },
      include: { steps: true },
    });
    if (existing) return toPlan(existing);

    const asOf = input.asOf ?? new Date();
    const planId = newId('dunp');
    const stepRows = STEP_DEFINITIONS.map((def) => ({
      id: newId('duns'),
      planId,
      kind: def.kind,
      status: 'scheduled' as const,
      dueAt: new Date(asOf.getTime() + def.offsetMs),
    }));

    await this.prisma.billingDunningPlan.create({
      data: {
        id: planId,
        subscriptionId: input.subscriptionId,
        status: 'active',
        reason: input.reason ?? null,
        steps: { create: stepRows },
      },
      include: { steps: true },
    });

    const created = await this.prisma.billingDunningPlan.findUnique({
      where: { id: planId },
      include: { steps: true },
    });
    // Prisma always finds a row we just inserted; the assertion is for ts.
    if (!created) throw new Error('billing_dunning_plan insert disappeared');
    return toPlan(created);
  }

  /**
   * Cancel every still-scheduled step inside the active plan for this
   * subscription and flip the plan to `recovered`. Called when the
   * subscription returns to `active` (or `trialing`) — payment came
   * back, no further nudges needed.
   */
  async cancelOnRecovery(input: { subscriptionId: string; asOf?: Date }): Promise<IDunningPlan | null> {
    const plan = await this.prisma.billingDunningPlan.findFirst({
      where: { subscriptionId: input.subscriptionId, status: 'active' },
      include: { steps: true },
    });
    if (!plan) return null;

    const asOf = input.asOf ?? new Date();
    await this.prisma.$transaction([
      this.prisma.billingDunningStep.updateMany({
        where: { planId: plan.id, status: 'scheduled' },
        data: { status: 'canceled', canceledAt: asOf },
      }),
      this.prisma.billingDunningPlan.update({
        where: { id: plan.id },
        data: { status: 'recovered', resolvedAt: asOf },
      }),
    ]);

    const refreshed = await this.prisma.billingDunningPlan.findUnique({
      where: { id: plan.id },
      include: { steps: true },
    });
    return refreshed ? toPlan(refreshed) : null;
  }

  /**
   * Cancel every still-scheduled step and close the plan as `completed`.
   * Used when the subscription is being canceled outright and there is
   * no point sending further dunning emails.
   */
  async cancelOnHardCancel(input: {
    subscriptionId: string;
    asOf?: Date;
  }): Promise<IDunningPlan | null> {
    const plan = await this.prisma.billingDunningPlan.findFirst({
      where: { subscriptionId: input.subscriptionId, status: 'active' },
      include: { steps: true },
    });
    if (!plan) return null;

    const asOf = input.asOf ?? new Date();
    await this.prisma.$transaction([
      this.prisma.billingDunningStep.updateMany({
        where: { planId: plan.id, status: 'scheduled' },
        data: { status: 'canceled', canceledAt: asOf },
      }),
      this.prisma.billingDunningPlan.update({
        where: { id: plan.id },
        data: { status: 'completed', resolvedAt: asOf },
      }),
    ]);

    const refreshed = await this.prisma.billingDunningPlan.findUnique({
      where: { id: plan.id },
      include: { steps: true },
    });
    return refreshed ? toPlan(refreshed) : null;
  }

  /**
   * Atomically mark a step `executed`. The worker calls this after it
   * performs the side-effect (send email, call Stripe, ...). Returns the
   * updated step. If the step is already non-scheduled, this is a no-op
   * that returns the current row — keeps retry behavior safe.
   */
  async markStepExecuted(input: IMarkStepExecutionInput): Promise<IDunningStep | null> {
    const step = await this.prisma.billingDunningStep.findUnique({ where: { id: input.stepId } });
    if (!step) return null;
    if (step.status !== 'scheduled') {
      return toStep(step);
    }
    const updated = await this.prisma.billingDunningStep.update({
      where: { id: input.stepId },
      data: {
        status: 'executed',
        executedAt: input.executedAt ?? new Date(),
        ...(input.result !== undefined ? { result: input.result as object } : {}),
      },
    });
    return toStep(updated);
  }

  /**
   * Mark a step `canceled` directly. Used when an admin manually skips
   * a step without affecting the rest of the plan.
   */
  async markStepCanceled(input: { stepId: string; asOf?: Date }): Promise<IDunningStep | null> {
    const step = await this.prisma.billingDunningStep.findUnique({ where: { id: input.stepId } });
    if (!step) return null;
    if (step.status !== 'scheduled') return toStep(step);
    const updated = await this.prisma.billingDunningStep.update({
      where: { id: input.stepId },
      data: { status: 'canceled', canceledAt: input.asOf ?? new Date() },
    });
    return toStep(updated);
  }

  /**
   * Write a structured result to a step without changing its status.
   * Used by the worker between handler execution and the
   * `markStepExecuted` transition so that T14_CANCEL (whose side-effect
   * flips the step to `canceled` via `cancelOnHardCancel`) still
   * preserves the worker output in `result`.
   */
  async recordStepResult(input: { stepId: string; result: unknown }): Promise<IDunningStep | null> {
    const step = await this.prisma.billingDunningStep.findUnique({ where: { id: input.stepId } });
    if (!step) return null;
    const updated = await this.prisma.billingDunningStep.update({
      where: { id: input.stepId },
      data: { result: (input.result ?? null) as object },
    });
    return toStep(updated);
  }


  /**
   * Steps that the worker can pick up: scheduled AND dueAt <= now.
   * The worker wraps the returned IDs in a transaction that flips
   * `scheduled → executing` (in a future executor table) before
   * performing the side-effect; here we keep it lean and just expose
   * the queue.
   */
  async findDueSteps(input: { asOf?: Date; limit?: number }): Promise<IDunningStep[]> {
    const rows = await this.prisma.billingDunningStep.findMany({
      where: { status: 'scheduled', dueAt: { lte: input.asOf ?? new Date() } },
      orderBy: { dueAt: 'asc' },
      take: Math.min(input.limit ?? 50, 500),
    });
    return rows.map(toStep);
  }

  /**
   * Lookup helper. Returns null when no plan has been opened.
   */
  async getPlan(subscriptionId: string): Promise<IDunningPlan | null> {
    const plan = await this.prisma.billingDunningPlan.findFirst({
      where: { subscriptionId },
      orderBy: { createdTime: 'desc' },
      include: { steps: true },
    });
    return plan ? toPlan(plan) : null;
  }
}

function toPlan(r: {
  id: string;
  subscriptionId: string;
  status: string;
  reason: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
  steps?: Array<{
    id: string;
    planId: string;
    kind: string;
    status: string;
    dueAt: Date;
    executedAt: Date | null;
    canceledAt: Date | null;
    result: unknown;
    createdTime: Date;
    updatedTime: Date;
  }>;
}): IDunningPlan {
  return {
    id: r.id,
    subscriptionId: r.subscriptionId,
    status: r.status as DunningPlanStatus,
    reason: r.reason,
    openedAt: r.openedAt,
    resolvedAt: r.resolvedAt,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
    ...(r.steps ? { steps: r.steps.map(toStep) } : {}),
  };
}

function toStep(r: {
  id: string;
  planId: string;
  kind: string;
  status: string;
  dueAt: Date;
  executedAt: Date | null;
  canceledAt: Date | null;
  result: unknown;
  createdTime: Date;
  updatedTime: Date;
}): IDunningStep {
  return {
    id: r.id,
    planId: r.planId,
    kind: r.kind as DunningStepKind,
    status: r.status as DunningStepStatus,
    dueAt: r.dueAt,
    executedAt: r.executedAt,
    canceledAt: r.canceledAt,
    result: r.result,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}
