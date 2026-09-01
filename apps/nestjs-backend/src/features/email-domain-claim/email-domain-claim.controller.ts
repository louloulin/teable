/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Email Domain Claim — admin endpoints (under `/api/admin/email-domain-claim/*`).
 *
 * Operator-only surface for listing and creating email-domain claims per
 * org. DNS verification is handled by `checkDomain` on the auth service,
 * not by this controller — the controller only issues pending claims.
 * Gated by the `admin_panel` LicenseCapabilityGuard.
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { EmailDomainClaimAuthService } from './email-domain-claim.auth.service';
import type { IEmailDomainClaim } from './email-domain-claim.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/email-domain-claim')
@UseGuards(AdminGuard)
export class EmailDomainClaimController {
  constructor(private readonly svc: EmailDomainClaimAuthService) {}

  @Get('list')
  async list(@Query('orgId') orgId: string) {
    const claims = orgId ? await this.svc.listClaims(orgId) : [];
    return {
      orgId: orgId ?? null,
      total: claims.length,
      claims,
    };
  }

  @Get('count')
  async count(@Query('orgId') orgId: string) {
    if (!orgId) return { orgId: null, total: 0 };
    const claims = await this.svc.listClaims(orgId);
    return { orgId, total: claims.length };
  }

  @Post('claim')
  async claim(
    @Body()
    body: { orgId: string; domain: string; mode?: IEmailDomainClaim['mode']; defaultRoleId?: string | null }
  ) {
    if (!body?.orgId) throw new Error('orgId required');
    if (!body?.domain) throw new Error('domain required');
    const id = `clm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const claim = this.svc.normalize({
      id,
      orgId: body.orgId,
      domain: body.domain,
      mode: body.mode,
      defaultRoleId: body.defaultRoleId ?? null,
    });
    return this.svc.upsertClaim(claim);
  }
}
