/**
 * Canary — thin-DI wrapper (Stage N).
 *
 * Auth-only entry point for the canary system: a single `tripCanary` method
 * that records a trip event when lag thresholds are breached. Uses only
 * `findFirst` against Prisma; the full V2 routing flow stays in `CanaryService`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { computeCanaryLag, shouldTripCanary } from './canary.helpers';
import type { ICanaryTripResult } from './canary.types';

const tripThresholdMs = 5_000;

@Injectable()
export class CanaryAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the canary lag using the most recent setting row and return
   * whether the trip threshold has been breached. Lightweight, read-only.
   */
  async tripCanary(now: Date = new Date()): Promise<ICanaryTripResult> {
    // The setting row is keyed by SettingKey.CANARY_CONFIG (string column);
    // we only read it to anchor `expectedAt` so the lag is meaningful.
    const setting = await this.prisma.setting.findFirst({
      where: { name: 'canary_config' },
      select: { lastModifiedTime: true, createdTime: true },
    });
    const expectedAt = setting?.lastModifiedTime ?? setting?.createdTime ?? now;
    const observedLagMs = computeCanaryLag(now, expectedAt);
    return shouldTripCanary(observedLagMs, tripThresholdMs);
  }
}
