/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Audit retention — admin HTTP controller (Round-INFRA-7).
 *
 *   GET  /api/admin/audit-retention/list
 *   GET  /api/admin/audit-retention/count
 *   GET  /api/admin/audit-retention/stats
 *   POST /api/admin/audit-retention/update
 *
 * Read-mostly views over the persisted retention policies plus a
 * narrow update path so the admin panel can adjust hot/cold windows
 * per org. Sweep runs and job persistence stay inside the service.
 *
 * License: AGPL-3.0
 */
import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AuditRetentionAuthService } from './audit-retention.auth.service';
import type { StorageTarget } from './audit-retention.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface IUpdateBody {
  orgId: string;
  hotDays?: number;
  coldDays?: number;
  coldTarget?: StorageTarget | null;
  coldBucket?: string | null;
  coldPrefix?: string | null;
  redactPii?: boolean;
  updatedBy?: string;
}

@Controller('api/admin/audit-retention')
@UseGuards(AdminGuard)
export class AuditRetentionAdminController {
  constructor(private readonly svc: AuditRetentionAuthService) {}

  @Get('list')
  async list(@Query('orgId') orgId?: string) {
    if (orgId) {
      const policy = await this.svc.loadPolicy(orgId);
      return { total: policy ? 1 : 0, policies: policy ? [policy] : [] };
    }
    const policies = await this.svc.listAllPolicies();
    return { total: policies.length, policies };
  }

  @Get('count')
  async count() {
    return { count: await this.svc.countPolicies() };
  }

  @Get('stats')
  stats() {
    return this.svc.retentionStats();
  }

  @Post('update')
  async update(@Body() body: IUpdateBody) {
    if (!body?.orgId) throw new NotFoundException('orgId required');
    const current = await this.svc.loadPolicy(body.orgId);
    const normalized = this.svc.normalize({
      orgId: body.orgId,
      hotDays: body.hotDays ?? current?.hotDays,
      coldDays: body.coldDays ?? current?.coldDays,
      coldTarget: body.coldTarget ?? current?.coldTarget,
      coldBucket: body.coldBucket ?? current?.coldBucket,
      coldPrefix: body.coldPrefix ?? current?.coldPrefix,
      redactPii: body.redactPii ?? current?.redactPii,
      ...(body.updatedBy ? { updatedBy: body.updatedBy } : {}),
    });
    const err = this.svc.validate(normalized);
    if (err) throw new NotFoundException(`invalid policy: ${err}`);
    return this.svc.upsertPolicy(normalized);
  }
}
