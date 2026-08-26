/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SCIM admin-side endpoints (under `/api/admin/scim/*`), consumed by the
 * SCIM admin panel to inspect config and synced entities.
 *
 * Gated by the `sso` LicenseCapabilityGuard so SCIM is paid-tier when
 * licensed, falls through to OSS in self-hosted mode.
 */
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type {
  IScimConfigVo,
  IScimConfigWithTokenVo,
  IScimListGroupsVo,
  IScimListUsersVo,
} from '@teable/openapi';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { ScimService } from './scim.service';

const ScimGuard = LicenseCapabilityGuard.for('sso');

@Controller('api/admin/scim')
@UseGuards(ScimGuard)
export class ScimAdminController {
  constructor(private readonly scim: ScimService) {}

  @Get('config')
  async getConfig(): Promise<IScimConfigVo> {
    const cfg = await this.scim.loadConfig();
    const users = await this.scim.listInstanceUsers();
    return {
      enabled: cfg.enabled,
      endpoint: '/scim/v2',
      hasToken: Boolean(cfg.tokenHash),
      createdTime: cfg.createdTime,
      lastRotatedTime: cfg.lastRotatedTime,
      userCount: users.length,
      groupCount: 0,
    };
  }

  @Post('config/rotate')
  async rotate(): Promise<IScimConfigWithTokenVo> {
    const { token, cfg } = await this.scim.rotateToken();
    const users = await this.scim.listInstanceUsers();
    return {
      enabled: cfg.enabled,
      endpoint: '/scim/v2',
      hasToken: true,
      createdTime: cfg.createdTime,
      lastRotatedTime: cfg.lastRotatedTime,
      userCount: users.length,
      groupCount: 0,
      token,
    };
  }

  @Get('users')
  async listUsers(): Promise<IScimListUsersVo> {
    const users = await this.scim.listInstanceUsers();
    return {
      total: users.length,
      users: users.map((u) => ({
        id: u.id,
        externalId: u.email,
        userName: u.email,
        displayName: u.name,
        email: u.email,
        active: !u.deactivatedTime,
      })),
    };
  }

  @Get('groups')
  async listGroups(): Promise<IScimListGroupsVo> {
    return { total: 0, groups: [] };
  }
}
