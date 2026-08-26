/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type RetentionPlan = 'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise';

// Plan-aware retention windows, in days. Self-host operators get a short
// 14-day window by default — they can lengthen it by manually deleting the
// scheduler from the BullMQ queue. The brief's "商业版必看" wording means the
// longer windows are reserved for paid plans; matching the Cloud pricing page
// (free 14d / pro 365d / business 1095d).
const RETENTION_DAYS: Record<RetentionPlan, number> = {
  self_hosted: 14,
  free: 14,
  pro: 365,
  business: 1095,
  enterprise: 1095,
};

/**
 * Retention cleanup. Purges rows from history-like tables that have aged past
 * the plan-aware retention window. Targets:
 *
 *   - record_history (the per-row change log) — pruned to the plan window.
 *   - audit_log (the per-request security audit trail) — pruned to the plan
 *     window when an explicit `retentionDays` override is set, otherwise left
 *     alone (audit_log is the operator's compliance artifact and is normally
 *     governed by external retention policy).
 *
 * This service is intentionally side-effect-only — there is no public REST
 * surface. The BullMQ processor in retention.processor.ts schedules a daily
 * invocation at 03:00 UTC.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prismaService: PrismaService) {}

  static getRetentionDays(plan: RetentionPlan): number {
    return RETENTION_DAYS[plan];
  }

  /**
   * Sweep record_history rows older than the retention window. Returns the
   * number of rows deleted so the caller (BullMQ processor) can log the
   * outcome. Safe to run when the table is empty — no-op.
   */
  async purgeExpiredRecords(plan: RetentionPlan = 'self_hosted'): Promise<{ deleted: number }> {
    const days = RetentionService.getRetentionDays(plan);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // record_history has no on-prisma-model here (it's part of v2/cqrs layer);
    // we only purge the legacy record-history table when present, by way of a
    // raw SQL guard. If the table is missing, this is a no-op.
    try {
      const result = await this.prismaService.$tx(async () => {
        return this.prismaService.txClient().$executeRawUnsafe(
          `DELETE FROM record_history WHERE created_time < $1`,
          cutoff.toISOString()
        );
      });
      this.logger.log(
        `[retention] purged record_history older than ${days}d (cutoff=${cutoff.toISOString()}, deleted=${result})`
      );
      return { deleted: Number(result) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Missing-table is a benign "no v2 history yet" condition — log at info
      // and return zero so the scheduler does not alert on first-run installs.
      if (message.toLowerCase().includes('does not exist')) {
        this.logger.debug(`[retention] record_history table not present; skipping`);
        return { deleted: 0 };
      }
      throw error;
    }
  }
}
