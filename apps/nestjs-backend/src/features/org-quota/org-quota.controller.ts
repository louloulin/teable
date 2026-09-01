/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Quota — admin HTTP controller (Round-INFRA-7).
 *
 * Surfaces per-org quota envelopes (Stage 65) and the overage
 * ledger for the admin panel / dashboard widgets. Wire-side
 * mutations (persistEnvelope, checkAndGrant) stay on
 * OrgQuotaAuthService and are invoked from the request
 * interceptor — this controller is read-only.
 *
 *   GET /api/admin/org-quota/:orgId
 *   GET /api/admin/org-quota/over?limit=50
 *   GET /api/admin/org-quota/count
 *
 * Gated by the `admin_panel` capability so the endpoint is only
 * reachable when the license tier includes admin tooling.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { OrgQuotaAuthService } from './org-quota.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/org-quota')
@UseGuards(AdminGuard)
export class OrgQuotaController {
  constructor(
    private readonly auth: OrgQuotaAuthService,
    private readonly prisma: PrismaService
  ) {}

  @Get(':orgId')
  async getEnvelope(@Param('orgId') orgId: string) {
    const envelope = await this.auth.loadEnvelope(orgId);
    return { organizationId: orgId, envelope };
  }

  @Get('over/list')
  async listOverQuota(@Query('limit') limit?: string) {
    const take = Math.max(1, Math.min(Number(limit) || 50, 500));
    const rows = await this.prisma.orgQuotaEnvelope.findMany({ take });
    const enriched = await Promise.all(
      rows.map(async (row) => ({
        organizationId: row.orgId,
        policy: row.policy,
        overages: await this.auth.recentOverages(row.orgId, 5),
      }))
    );
    return { total: enriched.length, organizations: enriched };
  }

  @Get('over/count')
  async countOverQuota(): Promise<{ count: number }> {
    const count = await this.prisma.orgQuotaOverage.count();
    return { count };
  }
}
