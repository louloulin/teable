/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SCIM 2.0 push-provisioning endpoints.
 *
 * Two surfaces:
 *   1. Public `/scim/v2/*` gated by ScimAuthGuard (bearer token from the
 *      SCIM admin panel). Used by IdPs (Okta / Azure AD / OneLogin) to
 *      push users.
 *   2. Admin `/api/admin/scim/*` gated by the `sso` LicenseCapabilityGuard
 *      so SCIM is paid-tier when licensed, falls through to OSS in
 *      self-hosted mode.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import type {
  IScimConfigVo,
  IScimConfigWithTokenVo,
  IScimListGroupsVo,
  IScimListUsersVo,
} from '@teable/openapi';
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimService } from './scim.service';

const ScimGuard = LicenseCapabilityGuard.for('sso');

interface IScimUserInput {
  userName?: string;
  externalId?: string;
  name?: { formatted?: string };
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean }>;
  active?: boolean;
}

const listsToVo = <T>(rows: T[]) => ({
  totalResults: rows.length,
  itemsPerPage: rows.length,
  startIndex: 1,
  Resources: rows,
});

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

@UseGuards(ScimAuthGuard)
@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scim: ScimService) {}

  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://datatracker.ietf.org/doc/html/rfc7644',
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: false, maxResults: 0 },
      sort: { supported: false },
      etag: { supported: false },
      changePassword: { supported: false },
    };
  }

  @Get('Users')
  async listUsers(
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string
  ) {
    const all = await this.scim.listInstanceUsers();
    const mapped = all.map((u) => this.scim.toScimUser(u));
    const filtered = filter
      ? mapped.filter((u) => u.emails?.[0]?.value?.toLowerCase().includes(filter.toLowerCase()))
      : mapped;
    const c = count
      ? Math.min(parseInt(count, 10) || filtered.length, filtered.length)
      : filtered.length;
    const sI = startIndex ? Math.max(1, parseInt(startIndex, 10) || 1) : 1;
    return listsToVo(filtered.slice(sI - 1, sI - 1 + c));
  }

  @Get('Users/:id')
  async getUser(@Param('id') id: string) {
    const u = await this.scim.findInstanceUserById(id);
    if (!u) throw new NotFoundException('User not found');
    return this.scim.toScimUser(u);
  }

  @Post('Users')
  async createUser(@Body() body: IScimUserInput) {
    const email = body.emails?.[0]?.value ?? body.userName;
    if (!email) throw new NotFoundException('userName or emails[0].value is required');
    const existing = await this.scim.findInstanceUserByEmail(email);
    const user =
      existing ??
      (await this.scim.provisionUser({
        email,
        name: body.name?.formatted ?? body.displayName,
        externalId: body.externalId,
      }));
    return this.scim.toScimUser(user);
  }

  @Put('Users/:id')
  async replaceUser(@Param('id') id: string, @Body() body: IScimUserInput) {
    const existing = await this.scim.findInstanceUserById(id);
    if (!existing) throw new NotFoundException('User not found');
    const name = body.name?.formatted ?? body.displayName ?? existing.name;
    const updated = await this.scim.patchUserName(id, name);
    return this.scim.toScimUser(updated!);
  }

  @Patch('Users/:id')
  async patchUser(@Param('id') id: string, @Body() body: IScimUserInput) {
    const existing = await this.scim.findInstanceUserById(id);
    if (!existing) throw new NotFoundException('User not found');
    const name = body.name?.formatted ?? body.displayName ?? existing.name;
    const updated = await this.scim.patchUserName(id, name);
    return this.scim.toScimUser(updated!);
  }

  @Delete('Users/:id')
  async deleteUser(@Param('id') id: string) {
    const existing = await this.scim.findInstanceUserById(id);
    if (!existing) throw new NotFoundException('User not found');
    await this.scim.deactivateUser(id);
    return { status: 204 };
  }

  @Get('Groups')
  listGroups() {
    return listsToVo([] as Array<Record<string, unknown>>);
  }
}
