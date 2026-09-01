/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Cross-org admin grants — admin HTTP controller (Round-INFRA-5).
 *
 *   GET  /api/admin/cross-org-admin/grants
 *   GET  /api/admin/cross-org-admin/grants?userId=...
 *   GET  /api/admin/cross-org-admin/grants?spaceId=...
 *   POST /api/admin/cross-org-admin/grants
 *   DELETE /api/admin/cross-org-admin/grants/:id
 *
 * Mutations are persisted in `meta.cross_org_admin_grant`; `orgId` remains
 * an explicit compatibility alias for older admin clients.
 *
 * License: AGPL-3.0
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CrossOrgAdminService } from './cross-org-admin.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface ICreateGrantBody {
  userId: string;
  spaceId?: string;
  orgId?: string;
  role?: string;
  reason?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
}

@Controller('api/admin/cross-org-admin')
@UseGuards(AdminGuard)
export class CrossOrgAdminController {
  constructor(private readonly svc: CrossOrgAdminService) {}

  @Get('grants')
  async list(
    @Query('userId') userId?: string,
    @Query('spaceId') spaceId?: string,
    @Query('orgId') orgId?: string
  ) {
    const grants = await this.svc.listGrants({ userId, spaceId, orgId });
    return { total: grants.length, grants };
  }

  @Get('grants/count')
  async count() {
    return { count: await this.svc.count() };
  }

  @Post('grants')
  async grant(@Body() body: ICreateGrantBody) {
    const spaceId = body?.spaceId ?? body?.orgId;
    if (!body?.userId || !spaceId) {
      throw new NotFoundException('userId and spaceId are required');
    }
    return this.svc.grant({
      userId: body.userId,
      spaceId,
      grantedBy: 'usr_admin',
      role: body.role ?? (body.scopes?.includes('space:*') ? 'owner' : 'admin'),
      reason: body.reason ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
  }

  @Delete('grants/:id')
  async revoke(@Param('id') id: string) {
    const ok = await this.svc.revoke(id);
    if (!ok) throw new NotFoundException(`grant not found: ${id}`);
    return { revoked: true, id };
  }
}
