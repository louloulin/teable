/**
 * Record-history retention — auth layer (Stage 59).
 *
 * Looks up the per-base subscriber context from Prisma and resolves
 * the effective retention policy. Wires the pure resolver to the
 * existing `record_history` / `audit_log` table layout.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { describeResolution, resolveRetention } from './record-history-retention.service';
import type {
  IRetentionQueryResult,
  IResolvedRetention,
  ISubscriberContext,
  PlanTier,
} from './record-history-retention.types';

export interface ISubscriberLookup {
  /** Resolve the subscriber context for a base. May return null if unknown. */
  lookupSubscriber(baseId: string): Promise<ISubscriberContext | null>;
}

@Injectable()
export class PrismaSubscriberLookup implements ISubscriberLookup {
  constructor(private readonly prisma: PrismaService) {}

  async lookupSubscriber(baseId: string): Promise<ISubscriberContext | null> {
    const row = await this.prisma.space.findFirst({
      where: { id: baseId },
      select: { id: true, deletedTime: true },
    });
    if (!row) return null;
    // Placeholder: in OSS, every space is "free" by default. Stage 32
    // (Stripe billing) wires the real tier here. For now we return
    // the lowest tier so the resolver still produces a policy.
    return { tier: 'free' };
  }
}

@Injectable()
export class RecordHistoryRetentionAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriberLookup: ISubscriberLookup
  ) {}

  async getRetention(baseId: string): Promise<IRetentionQueryResult> {
    const ctx = await this.subscriberLookup.lookupSubscriber(baseId);
    const tier: PlanTier = ctx?.tier ?? 'free';
    const merged: ISubscriberContext = {
      tier,
      overrideDays: ctx?.overrideDays,
      enterpriseOverride: ctx?.enterpriseOverride,
    };
    const resolved = resolveRetention(merged);
    return {
      baseId,
      resolved,
      purgeBefore: computePurgeBefore(resolved),
    };
  }

  /** Convenience used by `record_history` writes to cap per-base rows. */
  async withinRecordCap(baseId: string): Promise<boolean> {
    const { resolved } = await this.getRetention(baseId);
    if (resolved.maxRecordsPerBase === 0) return true;
    const count = await this.prisma.recordHistory.count({ where: { baseId } });
    return count < resolved.maxRecordsPerBase;
  }

  /** Human-readable summary used by admin endpoints / changelog rows. */
  async describe(baseId: string): Promise<string> {
    const { resolved } = await this.getRetention(baseId);
    return describeResolution(resolved);
  }
}

function computePurgeBefore(resolved: IResolvedRetention): string {
  if (!Number.isFinite(resolved.retentionDays)) {
    return new Date(864_000_000_000_000).toISOString();
  }
  const cutoff = new Date(Date.now() - resolved.retentionDays * 86_400_000);
  return cutoff.toISOString();
}
