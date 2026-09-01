/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * AI Credit — admin HTTP controller (Round-INFRA-2).
 *
 * Exposes AI credit ledger read endpoints for the admin panel:
 *   GET /api/admin/ai-credit/:orgId/monthly?monthBucket=YYYY-MM
 *     → { orgId, monthBucket, usage: IAiCreditUsageRow }
 *
 * The wire-side mutations (record(), check(), rollover()) remain on
 * AiCreditAuthService and are invoked from internal feature modules.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AiCreditAuthService } from './ai-credit.auth.service';
import type { IAiCreditUsageRow } from './ai-credit.types';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const AiGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/ai-credit')
@UseGuards(AiGuard)
export class AiCreditController {
  constructor(private readonly auth: AiCreditAuthService) {}

  @Get(':orgId/monthly')
  async getMonthlyUsage(
    @Param('orgId') orgId: string,
    @Query('monthBucket') monthBucket?: string
  ): Promise<{
    orgId: string;
    monthBucket: string;
    usage: IAiCreditUsageRow;
  }> {
    const bucket = monthBucket ?? new Date().toISOString().slice(0, 7);
    const usage = await this.auth.monthlyUsage({
      organizationId: orgId,
      monthBucket: bucket,
    });
    return { orgId, monthBucket: bucket, usage };
  }
}
