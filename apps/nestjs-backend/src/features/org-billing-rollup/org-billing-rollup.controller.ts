/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Billing Rollup — admin HTTP controller (Round-INFRA-7).
 *
 * Surfaces per-org billing rollups (Stage 69) for the admin /
 * finance console. Wire-side mutations (produceRollup,
 * recordLineItem) stay on OrgBillingRollupAuthService.
 *
 *   GET /api/admin/org-billing-rollup/:orgId?period=YYYY-MM&currency=USD
 *   GET /api/admin/org-billing-rollup/:orgId/list?limit=20
 *
 * Gated by the `admin_panel` capability.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { OrgBillingRollupAuthService } from './org-billing-rollup.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/org-billing-rollup')
@UseGuards(AdminGuard)
export class OrgBillingRollupController {
  constructor(
    private readonly auth: OrgBillingRollupAuthService,
    private readonly prisma: PrismaService
  ) {}

  @Get(':orgId')
  async getRollup(
    @Param('orgId') orgId: string,
    @Query('period') period?: string,
    @Query('currency') currency?: string
  ) {
    const periodKey = period ?? new Date().toISOString().slice(0, 7);
    const currencies: Array<'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP'> = [
      'USD',
      'EUR',
      'CNY',
      'JPY',
      'GBP',
    ];
    const currencyFilter =
      currency && currencies.includes(currency as 'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP')
        ? (currency as 'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP')
        : 'USD';
    const rollup = await this.auth.loadRollup({ orgId, period: periodKey, currency: currencyFilter });
    return { organizationId: orgId, period: periodKey, currency: currencyFilter, rollup };
  }

  @Get(':orgId/list')
  async listRollups(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string
  ) {
    const take = Math.max(1, Math.min(Number(limit) || 20, 200));
    const rows = await this.prisma.billingRollup.findMany({
      where: { orgId },
      orderBy: { period: 'desc' },
      take,
    });
    return {
      organizationId: orgId,
      total: rows.length,
      rollups: rows.map((r) => ({
        period: r.period,
        currency: r.currency,
        grossMinor: r.grossMinor,
        creditsMinor: r.creditsMinor,
        netMinor: r.netMinor,
        lineCount: r.lineCount,
        baseCount: r.baseCount,
        dunningLevel: r.dunningLevel,
        generatedAt: r.generatedAt.toISOString(),
      })),
    };
  }
}
