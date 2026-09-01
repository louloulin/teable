/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * AI usage — admin HTTP controller (Round-INFRA-3).
 *
 * Surfaces per-org AI usage buckets (model × action × month) and
 * summary rollups for the admin panel / dashboard widgets. Wire-side
 * mutations stay on AiUsageAuthService.recordUsage() (called by the
 * chat / field / app-builder feature modules).
 *
 *   GET /api/admin/ai-usage/:orgId/buckets?monthBucket=YYYY-MM
 *   GET /api/admin/ai-usage/:orgId/summary?monthBucket=YYYY-MM
 *   GET /api/admin/ai-usage/:orgId/policy
 *
 * Gated by the `ai` capability so the endpoint is paid-tier when
 * licensed and falls through to OSS in self-hosted mode.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AiUsageAuthService } from './ai-usage.auth.service';
import type { IAiCreditGrantPolicy, IAiUsageBucket, IAiUsageSummary } from './ai-usage.types';

const AiGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/ai-usage')
@UseGuards(AiGuard)
export class AiUsageController {
  constructor(private readonly auth: AiUsageAuthService) {}

  @Get(':orgId/buckets')
  async listBuckets(
    @Param('orgId') orgId: string,
    @Query('monthBucket') monthBucket?: string
  ): Promise<{
    organizationId: string;
    monthBucket: string;
    buckets: IAiUsageBucket[];
    total: number;
  }> {
    const bucket = monthBucket ?? new Date().toISOString().slice(0, 7);
    const buckets = await this.auth.listBuckets({
      organizationId: orgId,
      monthBucket: bucket,
    });
    return {
      organizationId: orgId,
      monthBucket: bucket,
      buckets,
      total: buckets.length,
    };
  }

  @Get(':orgId/summary')
  async summary(
    @Param('orgId') orgId: string,
    @Query('monthBucket') monthBucket?: string
  ): Promise<IAiUsageSummary> {
    const bucket = monthBucket ?? new Date().toISOString().slice(0, 7);
    return this.auth.summary({ organizationId: orgId, monthBucket: bucket });
  }

  @Get(':orgId/policy')
  async policy(@Param('orgId') orgId: string): Promise<IAiCreditGrantPolicy | null> {
    return this.auth.getPolicy(orgId);
  }
}
