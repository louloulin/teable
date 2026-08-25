import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  AI_CREDIT_ACTIONS,
  buildCheckResult,
  coerceAction,
  computeCarryover,
  monthBucketFromDate,
  monthBucketToStart,
  summarizeMonth,
} from './ai-credit.service';
import type {
  AiCreditAction,
  IAiCreditCheckInput,
  IAiCreditCheckResult,
  IAiCreditEntry,
  IAiCreditUsageRow,
} from './ai-credit.types';

/**
 * AI credit ledger orchestrator — Stage 26.
 *
 * Records charge / refund / grant events and answers "is this
 * operation allowed under the org's monthly limit?" pre-flight
 * queries. Monthly rollup jobs use this service to compute the
 * carry-over grant for the next month.
 */
@Injectable()
export class AiCreditAuthService {
  /** Hard ceiling when no per-org override is set. -1 means "unlimited". */
  static readonly DEFAULT_MONTHLY_LIMIT = 1_000_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a credit-affecting event. Returns the persisted row.
   * Throws when `action` is not recognized or `credits` is non-positive.
   */
  async record(input: {
    organizationId: string;
    action: AiCreditAction;
    credits: number;
    provider?: string | null;
    sourceRef?: string | null;
  }): Promise<IAiCreditEntry> {
    if (!AI_CREDIT_ACTIONS.includes(input.action)) {
      throw new BadRequestException(`unknown action: ${input.action}`);
    }
    if (!Number.isInteger(input.credits) || input.credits <= 0) {
      throw new BadRequestException('credits must be a positive integer');
    }
    const now = new Date();
    const id = `aic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiCreditLedger.create({
      data: {
        id,
        organizationId: input.organizationId,
        action: input.action,
        credits: input.credits,
        provider: input.provider ?? null,
        sourceRef: input.sourceRef ?? null,
        monthBucket: monthBucketFromDate(now),
      },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      action: coerceAction(row.action),
      credits: row.credits,
      provider: row.provider,
      sourceRef: row.sourceRef,
      monthBucket: row.monthBucket,
      createdTime: row.createdTime,
    };
  }

  /** Read the rolled-up usage for a single month. */
  async monthlyUsage(input: {
    organizationId: string;
    monthBucket: string;
  }): Promise<IAiCreditUsageRow> {
    const rows = await this.prisma.aiCreditLedger.findMany({
      where: { organizationId: input.organizationId, monthBucket: input.monthBucket },
    });
    return summarizeMonth(
      rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        action: coerceAction(r.action),
        credits: r.credits,
        provider: r.provider,
        sourceRef: r.sourceRef,
        monthBucket: r.monthBucket,
        createdTime: r.createdTime,
      })),
      input.monthBucket
    );
  }

  /** Pre-flight check against the monthly limit. */
  async check(input: IAiCreditCheckInput & { limit: number }): Promise<IAiCreditCheckResult> {
    const monthBucket = input.monthBucket ?? monthBucketFromDate(new Date());
    const rows = await this.prisma.aiCreditLedger.findMany({
      where: { organizationId: input.organizationId, monthBucket },
    });
    const entries: IAiCreditEntry[] = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      action: coerceAction(r.action),
      credits: r.credits,
      provider: r.provider,
      sourceRef: r.sourceRef,
      monthBucket: r.monthBucket,
      createdTime: r.createdTime,
    }));
    return buildCheckResult({
      organizationId: input.organizationId,
      estimatedCredits: input.estimatedCredits,
      monthBucket,
      entries,
      limit: input.limit,
    });
  }

  /**
   * Compute the carry-over grant for the new month and write it as a
   * `grant` entry. Idempotent: returns 0 (no row) when one was
   * already written this month (sourceRef starts with `carry:<bucket>`).
   */
  async rollover(input: {
    organizationId: string;
    carryCap: number;
    limit: number;
    now?: Date;
  }): Promise<{ previousBucket: string | null; grantCredits: number; ledgerId: string | null }> {
    const now = input.now ?? new Date();
    const currentBucket = monthBucketFromDate(now);
    const prevStart = new Date(monthBucketToStart(currentBucket).getTime() - 1);
    const prevUsage = await this.monthlyUsage({
      organizationId: input.organizationId,
      monthBucket: monthBucketFromDate(prevStart),
    });
    const carry = computeCarryover({
      currentBucket,
      prevUsage,
      prevLimit: input.limit,
      carryCap: input.carryCap,
    });
    if (carry.grantCredits <= 0 || !carry.previousBucket) {
      return { previousBucket: carry.previousBucket, grantCredits: 0, ledgerId: null };
    }
    // Idempotency: skip when a carryover for this bucket was already written.
    const existing = await this.prisma.aiCreditLedger.findFirst({
      where: {
        organizationId: input.organizationId,
        action: 'grant',
        sourceRef: { startsWith: `carry:${carry.previousBucket}` },
      },
    });
    if (existing) {
      return { previousBucket: carry.previousBucket, grantCredits: 0, ledgerId: existing.id };
    }
    const id = `aic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await this.prisma.aiCreditLedger.create({
      data: {
        id,
        organizationId: input.organizationId,
        action: 'grant',
        credits: carry.grantCredits,
        provider: null,
        sourceRef: `carry:${carry.previousBucket}`,
        monthBucket: currentBucket,
      },
    });
    return { previousBucket: carry.previousBucket, grantCredits: carry.grantCredits, ledgerId: id };
  }
}
