/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org ban list — admin HTTP controller (Round-INFRA-7).
 *
 * Lists entries and exposes add/remove mutations; removal remains a
 * soft delete so the persisted audit trail stays intact.
 *
 * License: AGPL-3.0
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { OrgBanListAuthService } from './org-ban-list.auth.service';
import type { BanEntryKind, BanListMode } from './org-ban-list.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface IAddBody {
  orgId: string;
  kind: BanEntryKind;
  value: string;
  mode: BanListMode;
  reason?: string;
  expiresAt?: string | null;
  createdBy: string;
}

@Controller('api/admin/org-ban-list')
@UseGuards(AdminGuard)
export class OrgBanListAdminController {
  constructor(private readonly svc: OrgBanListAuthService) {}

  @Get('list')
  async list(@Query() query: { orgId?: string; kind?: string; mode?: string; includeRevoked?: string }) {
    if (!query.orgId) throw new NotFoundException('orgId query param required');
    const entries = await this.svc.listEntries({
      orgId: query.orgId,
      ...(query.kind ? { kind: query.kind as BanEntryKind } : {}),
      ...(query.mode ? { mode: query.mode as BanListMode } : {}),
      ...(query.includeRevoked === 'true' ? { includeRevoked: true } : {}),
    });
    return { total: entries.length, entries };
  }

  @Get('count')
  async count(@Query() query: { orgId?: string; includeRevoked?: string }) {
    if (!query.orgId) throw new NotFoundException('orgId query param required');
    return { count: await this.svc.countEntries({
      orgId: query.orgId,
      ...(query.includeRevoked === 'true' ? { includeRevoked: true } : {}),
    }) };
  }

  @Post('add')
  async add(@Body() body: IAddBody) {
    if (!body?.orgId || !body.kind || !body.value || !body.mode || !body.createdBy) {
      throw new NotFoundException('orgId, kind, value, mode, createdBy are required');
    }
    const now = new Date().toISOString();
    return this.svc.createEntry({
      id: `ban-${body.orgId}-${Date.now()}`,
      orgId: body.orgId,
      kind: body.kind,
      value: body.value,
      mode: body.mode,
      reason: body.reason ?? 'admin',
      expiresAt: body.expiresAt ?? null,
      createdBy: body.createdBy,
      auditId: `audit-${body.orgId}-${Date.now()}`,
      now,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Body() body: { orgId: string; revokedBy: string }) {
    if (!body?.orgId || !body.revokedBy) throw new NotFoundException('orgId and revokedBy are required');
    const result = await this.svc.revokeEntry({
      entryId: id,
      orgId: body.orgId,
      revokedBy: body.revokedBy,
      auditId: `audit-${body.orgId}-${Date.now()}`,
      now: new Date().toISOString(),
    });
    if (!result) throw new NotFoundException(`entry not found: ${id}`);
    return result;
  }
}
