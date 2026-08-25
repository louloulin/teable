import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { monthBucketFromDate } from '../ai-credit/ai-credit.service';
import {
  coercePolicy,
  exceedsModelCap,
  foldRecords,
  mergePerModelCap,
  normalizeAction,
  normalizeModel,
  summarize,
} from './ai-usage.service';
import type { IAiCreditGrantPolicy, IAiUsageBucket, IAiUsageSummary } from './ai-usage.types';

/**
 * AI usage breakdown orchestrator — Stage 29.
 *
 * Writes per-(org, model, action, month) counters (upsert) and
 * surfaces policy decisions for per-model caps.
 */
@Injectable()
export class AiUsageAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a credit event AND upsert the matching usage bucket.
   * Returns the updated bucket.
   */
  async recordUsage(input: {
    organizationId: string;
    model: string;
    action: string;
    credits: number;
    monthBucket?: string;
  }): Promise<IAiUsageBucket> {
    if (!input.organizationId) throw new BadRequestException('organizationId required');
    if (!Number.isInteger(input.credits) || input.credits <= 0) {
      throw new BadRequestException('credits must be a positive integer');
    }
    const monthBucket = input.monthBucket ?? monthBucketFromDate(new Date());
    const model = normalizeModel(input.model);
    const action = normalizeAction(input.action);
    const id = `aub_${input.organizationId}${model}${action}${monthBucket}`;

    const row = await this.prisma.aiUsageBucket.upsert({
      where: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        organizationId_model_action_monthBucket: {
          organizationId: input.organizationId,
          model,
          action,
          monthBucket,
        },
      },
      create: {
        id,
        organizationId: input.organizationId,
        model,
        action,
        credits: input.credits,
        eventCount: 1,
        monthBucket,
      },
      update: {
        credits: { increment: input.credits },
        eventCount: { increment: 1 },
      },
    });
    return toBucket(row);
  }

  /** Fetch one bucket by natural key, or null. */
  async getBucket(input: {
    organizationId: string;
    model: string;
    action: string;
    monthBucket: string;
  }): Promise<IAiUsageBucket | null> {
    const row = await this.prisma.aiUsageBucket.findUnique({
      where: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        organizationId_model_action_monthBucket: {
          organizationId: input.organizationId,
          model: normalizeModel(input.model),
          action: normalizeAction(input.action),
          monthBucket: input.monthBucket,
        },
      },
    });
    return row ? toBucket(row) : null;
  }

  /** List all buckets for an org/month. */
  async listBuckets(input: {
    organizationId: string;
    monthBucket: string;
  }): Promise<IAiUsageBucket[]> {
    const rows = await this.prisma.aiUsageBucket.findMany({
      where: { organizationId: input.organizationId, monthBucket: input.monthBucket },
    });
    return rows.map(toBucket);
  }

  /** Roll buckets into a summary (totals + by-model + by-action). */
  async summary(input: { organizationId: string; monthBucket: string }): Promise<IAiUsageSummary> {
    const buckets = await this.listBuckets(input);
    return summarize({ ...input, buckets });
  }

  /**
   * Pre-flight: should this (model, action) charge be allowed given
   * the org's per-model cap? Returns the decision + remaining budget.
   */
  async checkModelCap(input: {
    organizationId: string;
    model: string;
    action: string;
    estimatedCredits: number;
    monthBucket?: string;
  }): Promise<{ allowed: boolean; perModelCap: number | null; remaining: number | null }> {
    const monthBucket = input.monthBucket ?? monthBucketFromDate(new Date());
    const [bucket, policy] = await Promise.all([
      this.getBucket({
        organizationId: input.organizationId,
        model: input.model,
        action: input.action,
        monthBucket,
      }),
      this.getPolicy(input.organizationId),
    ]);
    const perModelCap = policy?.perModelCap[normalizeModel(input.model)] ?? null;
    if (perModelCap === null) {
      return { allowed: true, perModelCap: null, remaining: null };
    }
    const used = bucket?.credits ?? 0;
    const remaining = perModelCap - used;
    return {
      allowed: !exceedsModelCap({
        bucket,
        estimatedCredits: input.estimatedCredits,
        perModelCap: policy!.perModelCap,
      }),
      perModelCap,
      remaining,
    };
  }

  /** Read or default-init a policy. Default = unlimited. */
  async getPolicy(organizationId: string): Promise<IAiCreditGrantPolicy | null> {
    const row = await this.prisma.aiCreditGrantPolicy.findUnique({ where: { organizationId } });
    return row ? coercePolicy(row) : null;
  }

  /** Upsert policy. */
  async setPolicy(input: {
    organizationId: string;
    monthlyLimit: number;
    carryCap?: number;
    perModelCap?: Record<string, number>;
    updatedBy: string;
  }): Promise<IAiCreditGrantPolicy> {
    if (!input.organizationId) throw new BadRequestException('organizationId required');
    if (!Number.isInteger(input.monthlyLimit) || input.monthlyLimit < 0) {
      throw new BadRequestException('monthlyLimit must be a non-negative integer');
    }
    const carryCap = input.carryCap ?? 0;
    if (!Number.isInteger(carryCap) || carryCap < 0) {
      throw new BadRequestException('carryCap must be a non-negative integer');
    }
    const perModelCap = mergePerModelCap(input.perModelCap);
    const row = await this.prisma.aiCreditGrantPolicy.upsert({
      where: { organizationId: input.organizationId },
      create: {
        id: `pol_${input.organizationId}`,
        organizationId: input.organizationId,
        monthlyLimit: input.monthlyLimit,
        carryCap,
        perModelCapJson: Object.keys(perModelCap).length > 0 ? JSON.stringify(perModelCap) : null,
        updatedBy: input.updatedBy,
      },
      update: {
        monthlyLimit: input.monthlyLimit,
        carryCap,
        perModelCapJson: Object.keys(perModelCap).length > 0 ? JSON.stringify(perModelCap) : null,
        updatedBy: input.updatedBy,
      },
    });
    return coercePolicy(row);
  }

  /** Re-fold the supplied records into buckets in memory — useful for tests / dry-runs. */
  dryRunFold(records: Parameters<typeof foldRecords>[0]): IAiUsageBucket[] {
    return foldRecords(records);
  }
}

function toBucket(r: {
  id: string;
  organizationId: string;
  model: string;
  action: string;
  credits: number;
  eventCount: number;
  monthBucket: string;
  updatedTime: Date;
}): IAiUsageBucket {
  return {
    id: r.id,
    organizationId: r.organizationId,
    model: r.model,
    action: r.action,
    credits: r.credits,
    eventCount: r.eventCount,
    monthBucket: r.monthBucket,
    updatedTime: r.updatedTime,
  };
}

export { foldRecords, summarize, normalizeAction, normalizeModel };
