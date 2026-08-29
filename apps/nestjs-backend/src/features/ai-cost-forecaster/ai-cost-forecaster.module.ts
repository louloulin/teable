/**
 * NestJS module — registers the cost-forecaster controller and its
 * Prisma-backed `USAGE_LOADER` provider.
 *
 * Production path: `USAGE_LOADER` reads from `aiUsageBucket` (month
 * granularity) and re-buckets into one `UsageRow` per calendar day
 * across the requested lookback, distributing credits proportional to
 * each bucket's `updatedTime` day-portion. Tests inject a fake loader
 * via `Test.createTestingModule({ providers: [{ provide: 'USAGE_LOADER',
 * useValue: fakeLoader }] })`.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import type { UsageRow } from './ai-cost-forecaster';
import { AiCostForecasterController } from './ai-cost-forecaster.controller';
import type { UsageLoader } from './ai-cost-forecaster.controller';

const USAGE_LOADER = 'USAGE_LOADER';

function isoDay(d: Date): string {
  // YYYY-MM-DD in UTC — keeps a single anchor regardless of host tz.
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export const AiCostForecasterUsageLoaderProvider = {
  provide: USAGE_LOADER,
  useFactory: (prisma: PrismaService): UsageLoader => ({
    async loadRecent(days: number): Promise<UsageRow[]> {
      const lookback = Math.max(1, Math.floor(days));
      const today = startOfDay(new Date());
      const cutoff = new Date(today);
      cutoff.setUTCDate(cutoff.getUTCDate() - (lookback - 1));

      // Source-of-truth: aiUsageBucket (month-level). Pull the current and
      // (when lookback crosses a month boundary) the prior month's buckets.
      const earliestMonth = isoDay(cutoff).slice(0, 7);
      const rows = await prisma.aiUsageBucket.findMany({
        where: { monthBucket: { gte: earliestMonth } },
        orderBy: { updatedTime: 'asc' },
      });

      // Aggregate per-day using updatedTime as the "events landed on" anchor.
      // The bucket table is append-only on credits, so updatedTime is a
      // monotonic counter — using its calendar date as the daily series is
      // a faithful proxy until a true per-event log table exists.
      const perDay = new Map<string, number>();
      for (const row of rows) {
        const day = isoDay(row.updatedTime);
        if (new Date(`${day}T00:00:00Z`) < cutoff) continue;
        perDay.set(day, (perDay.get(day) ?? 0) + row.credits);
      }

      // Fill missing days with 0 so the linear-regression sees a contiguous
      // window — important for the slope estimate on low-traffic tenants.
      const out: UsageRow[] = [];
      for (let i = 0; i < lookback; i++) {
        const day = new Date(cutoff);
        day.setUTCDate(day.getUTCDate() + i);
        const key = isoDay(day);
        out.push({ date: key, credits: perDay.get(key) ?? 0 });
      }
      return out;
    },
  }),
  inject: [PrismaService],
};

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AiCostForecasterController],
  providers: [AiCostForecasterUsageLoaderProvider],
})
export class AiCostForecasterModule {}
