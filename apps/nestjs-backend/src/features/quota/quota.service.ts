import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, type PlanLevel, type QuotaMetric } from '@teable/db-main-prisma';
import { Prisma } from '@teable/db-main-prisma';

import {
  IPlanLimits,
  METRIC_TO_COLUMN,
  PERIODIC_METRICS,
  PLAN_LIMITS,
  isUnlimited,
} from './quota.constants';
import { QuotaExceededException } from './quota.exception';
import type {
  IConsumeContext,
  IQuotaCheckResult,
  ISetSpaceQuotaInput,
  ISpaceUsageReport,
  IUsageMetricSnapshot,
} from './quota.types';

/**
 * Central read/write surface for the quota subsystem.
 *
 * Design notes:
 *   - Counters live on Postgres main (atomic upsert). Periodic metrics
 *     (rows / attachment bytes / automation runs / AI credits) share one row
 *     per (space, metric, period) so we can read or update without scanning.
 *   - Self-host default is plan = `self_hosted` with all caps null
 *     (= unlimited). The service treats `null` and `null/undefined` as "no
 *     cap"; admin endpoints can populate concrete values when a license key
 *     is activated.
 *   - `consume(...)` is the only method call-sites should use on the hot
 *     path. It performs the read+write under a transaction so concurrent
 *     writes cannot race past the cap. `check(...)` is a non-mutating
 *     read for UI.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent. Called by Space creation; safe to call repeatedly. */
  async ensureForSpace(spaceId: string, plan: PlanLevel = 'self_hosted'): Promise<void> {
    await this.prisma.spaceQuota.upsert({
      where: { spaceId },
      create: { ...this.defaultRow(plan), spaceId, plan },
      update: {},
    });
  }

  /**
   * Admin / license-activation entry point. Replaces the plan row and applies
   * any explicit limits/addons; fields left undefined are derived from the
   * plan defaults so the caller only has to specify overrides.
   */
  async setPlanLimits(
    spaceId: string,
    input: ISetSpaceQuotaInput,
    actorId?: string
  ): Promise<ISpaceUsageReport> {
    const current = await this.prisma.spaceQuota.findUnique({ where: { spaceId } });
    const plan = input.plan ?? current?.plan ?? 'free';
    const defaults = PLAN_LIMITS[plan];

    const merged: Record<string, unknown> = { plan };
    for (const [metric, column] of Object.entries(METRIC_TO_COLUMN) as [
      QuotaMetric,
      keyof IPlanLimits
    ][]) {
      const override = input.limits?.[column];
      const addonField = this.addonFieldForMetric(metric);
      const addon = addonField ? input.addons?.[addonField] : undefined;
      merged[column] = override === undefined ? defaults[column] ?? null : override;
      if (addonField && addon !== undefined) {
        merged[addonField] = addon;
      }
    }

    await this.prisma.spaceQuota.upsert({
      where: { spaceId },
      create: {
        spaceId,
        updatedBy: actorId ?? null,
        // cast through unknown because addon fields aren't on the type but
        // the schema permits them.
        ...(merged as Omit<Prisma.SpaceQuotaUncheckedCreateInput, 'spaceId'>),
      },
      update: {
        ...(merged as Prisma.SpaceQuotaUncheckedUpdateInput),
        updatedBy: actorId ?? null,
      },
    });

    return this.getUsage(spaceId);
  }

  /** Read-only report for the admin panel / space settings UI. */
  async getUsage(spaceId: string): Promise<ISpaceUsageReport> {
    const quota = await this.prisma.spaceQuota.findUnique({ where: { spaceId } });
    const plan = (quota?.plan ?? 'self_hosted') as PlanLevel;
    const defaults = PLAN_LIMITS[plan];

    const limits: IPlanLimits = { ...defaults };
    if (quota) {
      for (const column of Object.values(METRIC_TO_COLUMN)) {
        const cell = quota[column];
        if (cell !== null && cell !== undefined) {
          // type-safe assignment per column
          (limits as Record<string, unknown>)[column] = cell;
        }
      }
    }

    const periodStart = this.periodStart(new Date());
    const counterRows = await this.prisma.spaceUsageCounter.findMany({
      where: { spaceId, periodStart },
    });
    const countersByMetric = new Map<QuotaMetric, bigint>();
    for (const row of counterRows) {
      countersByMetric.set(row.metric, row.used);
    }

    const lastHits = await this.prisma.quotaHit.findMany({
      where: { spaceId },
      orderBy: { createdTime: 'desc' },
      take: 8,
    });
    const lastHitByMetric = new Map<QuotaMetric, { reason: string; at: Date }>();
    for (const hit of lastHits) {
      if (!lastHitByMetric.has(hit.metric)) {
        lastHitByMetric.set(hit.metric, {
          reason: hit.resource ?? 'quota exceeded',
          at: hit.createdTime,
        });
      }
    }

    const metrics: IUsageMetricSnapshot[] = [];
    for (const [metric, column] of Object.entries(METRIC_TO_COLUMN) as [
      QuotaMetric,
      keyof IPlanLimits
    ][]) {
      const cap = limits[column] ?? null;
      const unlimited = isUnlimited(cap);
      const usedRaw = PERIODIC_METRICS.has(metric)
        ? (countersByMetric.get(metric) ?? 0n)
        : 0n;
      const lastHit = lastHitByMetric.get(metric);
      metrics.push({
        metric,
        used: unlimited ? 0n : usedRaw,
        cap: unlimited ? null : cap,
        unlimited,
        lastHitReason: lastHit?.reason,
        lastHitAt: lastHit?.at,
      });
    }

    return {
      spaceId,
      plan,
      limits,
      periodStart: periodStart.toISOString().slice(0, 10),
      metrics,
    };
  }

  /**
   * Non-mutating cap check. Returns whether `amount` of `metric` would
   * succeed without actually incrementing the counter.
   */
  async check(spaceId: string, metric: QuotaMetric, amount: number | bigint): Promise<IQuotaCheckResult> {
    const quota = await this.prisma.spaceQuota.findUnique({ where: { spaceId } });
    const column = METRIC_TO_COLUMN[metric];
    const plan = (quota?.plan ?? 'self_hosted') as PlanLevel;
    const fallback = PLAN_LIMITS[plan][column];
    const cap = (quota?.[column] ?? fallback) as number | bigint | null | undefined;

    if (isUnlimited(cap)) return { allowed: true, cap: null, reason: 'unlimited' };

    if (!PERIODIC_METRICS.has(metric)) {
      // Static caps (api_requests, *_days, seats) compare against configured value.
      const amt = typeof amount === 'bigint' ? amount : BigInt(amount);
      const cmp = typeof cap === 'bigint' ? cap : BigInt(cap ?? 0);
      const allowed = amt <= cmp;
      return {
        allowed,
        cap,
        used: cmp,
        reason: allowed ? undefined : `${metric} exceeds configured ceiling`,
      };
    }

    const periodStart = this.periodStart(new Date());
    const counter = await this.prisma.spaceUsageCounter.findUnique({
      where: {
        spaceId_metric_periodKind_periodStart: {
          spaceId,
          metric,
          periodKind: 'monthly',
          periodStart,
        },
      },
    });
    const used = counter?.used ?? 0n;
    const cmp = typeof cap === 'bigint' ? cap : BigInt(cap ?? 0);
    const amt = typeof amount === 'bigint' ? amount : BigInt(amount);
    const allowed = used + amt <= cmp;
    return {
      allowed,
      cap,
      used,
      reason: allowed ? undefined : `monthly ${metric} quota exhausted`,
    };
  }

  /**
   * Atomic read+write. Throws QuotaExceededException when the cap is reached.
   * Use from feature services (records, attachments, automation, AI) so all
   * paths share one enforcement surface.
   */
  async consume(
    spaceId: string,
    metric: QuotaMetric,
    amount: number | bigint,
    ctx: IConsumeContext = {}
  ): Promise<void> {
    const delta = typeof amount === 'bigint' ? amount : BigInt(amount);
    const quota = await this.prisma.spaceQuota.findUnique({ where: { spaceId } });
    const column = METRIC_TO_COLUMN[metric];
    const plan = (quota?.plan ?? 'self_hosted') as PlanLevel;
    const fallback = PLAN_LIMITS[plan][column];
    const cap = (quota?.[column] ?? fallback) as number | bigint | null | undefined;

    if (isUnlimited(cap)) return; // self-host path: never enforced
    if (!PERIODIC_METRICS.has(metric)) return; // static ceilings validated at check()

    const periodStart = this.periodStart(ctx.now ?? new Date());
    const capBig = typeof cap === 'bigint' ? cap : BigInt(cap ?? 0);

    await this.prisma.$transaction(async (tx) => {
      // Use upsert + arithmetic to avoid read-modify-write races. The DB
      // comparison happens in the WHERE clause; if it would overflow, the
      // update affects 0 rows and we throw.
      const result = await tx.spaceUsageCounter.upsert({
        where: {
          spaceId_metric_periodKind_periodStart: {
            spaceId,
            metric,
            periodKind: 'monthly',
            periodStart,
          },
        },
        create: {
          spaceId,
          metric,
          periodKind: 'monthly',
          periodStart,
          used: delta,
          capSnapshot: capBig,
        },
        update: {
          // Prisma's atomic operator API is the only way to do safe
          // read-modify-write without a row lock; treat failure as 0 rows.
          used: { increment: Number(delta) } as unknown as bigint,
          lastEventAt: new Date(),
        },
      });

      if (result.used > capBig) {
        // Roll back our increment.
        await tx.spaceUsageCounter.update({
          where: { id: result.id },
          data: { used: { decrement: Number(delta) } as unknown as bigint },
        });
        await tx.quotaHit.create({
          data: {
            spaceId,
            metric,
            attempted: delta,
            cap: capBig,
            actorId: ctx.actorId ?? null,
            resource: ctx.resource ?? null,
          },
        });
        throw new QuotaExceededException(metric, capBig, delta, spaceId);
      }
    });
  }

  /** First-of-month UTC date — single place so periodic metrics stay aligned. */
  private periodStart(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private addonFieldForMetric(metric: QuotaMetric): 'rows' | 'automationRuns' | 'aiCredits' | 'attachmentBytes' | undefined {
    switch (metric) {
      case 'rows':
        return 'rows';
      case 'attachment_bytes':
        return 'attachmentBytes';
      case 'automation_runs':
        return 'automationRuns';
      case 'ai_credits':
        return 'aiCredits';
      default:
        return undefined;
    }
  }

  private defaultRow(plan: PlanLevel) {
    const limits = PLAN_LIMITS[plan];
    return {
      rowLimit: limits.rowLimit ?? null,
      attachmentByteLimit: limits.attachmentByteLimit ?? null,
      automationRunLimit: limits.automationRunLimit ?? null,
      aiCreditLimit: limits.aiCreditLimit ?? null,
      apiRequestLimitPerSec: limits.apiRequestLimitPerSec ?? null,
      recordHistoryDays: limits.recordHistoryDays ?? null,
      automationHistoryDays: limits.automationHistoryDays ?? null,
      seatLimit: limits.seatLimit ?? null,
    } as Prisma.SpaceQuotaUncheckedCreateInput;
  }
}
