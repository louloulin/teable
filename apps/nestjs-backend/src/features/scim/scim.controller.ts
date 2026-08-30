/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SCIM 2.0 push-provisioning endpoints (RFC 7644). Public `/scim/v2/*`
 * gated by ScimAuthGuard (bearer token from the SCIM admin panel). Used by
 * IdPs (Okta / Azure AD / OneLogin) to push users and groups into this
 * instance. Sized to stay under the ~200-line guidance in the Wave 9 build
 * brief — per-endpoint logic that grows past that should move into
 * ScimService.
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
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimService } from './scim.service';

interface IScimUserInput {
  userName?: string;
  externalId?: string;
  name?: { formatted?: string };
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean }>;
  active?: boolean;
}

interface IScimGroupInput {
  displayName?: string;
  externalId?: string;
  members?: Array<{ value: string; display?: string }>;
}

interface IScimGroupPatchInput {
  // RFC 7644 §3.5.2 mandates the PascalCase `Operations` field.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Operations?: Array<{ op: 'add' | 'remove' | 'replace'; path?: string; value?: unknown }>;
}

const listsToVo = <T>(rows: T[]) => ({
  totalResults: rows.length,
  itemsPerPage: rows.length,
  startIndex: 1,
  Resources: rows,
});

const paginate = <T>(rows: T[], startIndex?: string, count?: string) => {
  const c = count ? Math.min(parseInt(count, 10) || rows.length, rows.length) : rows.length;
  const sI = startIndex ? Math.max(1, parseInt(startIndex, 10) || 1) : 1;
  return rows.slice(sI - 1, sI - 1 + c);
};

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

  // ── Users ────────────────────────────────────────────────────────────
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
    return listsToVo(paginate(filtered, startIndex, count));
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
    if (!user) throw new NotFoundException('User could not be provisioned');
    return this.scim.toScimUser(user);
  }

  @Put('Users/:id')
  replaceUser(@Param('id') id: string, @Body() body: IScimUserInput) {
    return this.applyUserReplace(id, body);
  }

  @Patch('Users/:id')
  patchUser(@Param('id') id: string, @Body() body: IScimUserInput) {
    return this.applyUserReplace(id, body);
  }

  private async applyUserReplace(id: string, body: IScimUserInput) {
    const existing = await this.scim.findInstanceUserById(id);
    if (!existing) throw new NotFoundException('User not found');
    const name = body.name?.formatted ?? body.displayName ?? existing.name;
    const updated = await this.scim.patchUserName(id, name);
    if (!updated) throw new NotFoundException('User not found');
    return this.scim.toScimUser(updated);
  }

  @Delete('Users/:id')
  async deleteUser(@Param('id') id: string) {
    const existing = await this.scim.findInstanceUserById(id);
    if (!existing) throw new NotFoundException('User not found');
    await this.scim.deactivateUser(id);
    return { status: 204 };
  }

  // ── Groups ───────────────────────────────────────────────────────────
  @Get('Groups')
  async listGroups(
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string
  ) {
    const all = await this.scim.listGroups();
    const filtered = filter
      ? all.filter((g) => g.displayName.toLowerCase().includes(filter.toLowerCase()))
      : all;
    return listsToVo(paginate(filtered, startIndex, count).map((g) => this.scim.toScimGroup(g)));
  }

  @Post('Groups')
  async createGroup(@Body() body: IScimGroupInput) {
    if (!body.displayName) throw new NotFoundException('displayName is required');
    const created = await this.scim.createGroup({
      displayName: body.displayName,
      externalId: body.externalId,
      members: body.members,
    });
    return this.scim.toScimGroup(created);
  }

  @Get('Groups/:id')
  async getGroup(@Param('id') id: string) {
    const g = await this.scim.findGroupById(id);
    if (!g) throw new NotFoundException('Group not found');
    return this.scim.toScimGroup(g);
  }

  @Put('Groups/:id')
  async replaceGroup(@Param('id') id: string, @Body() body: IScimGroupInput) {
    if (!body.displayName) throw new NotFoundException('displayName is required');
    const updated = await this.scim.replaceGroup(id, {
      displayName: body.displayName,
      externalId: body.externalId,
      members: body.members,
    });
    return this.scim.toScimGroup(updated);
  }

  @Patch('Groups/:id')
  async patchGroup(@Param('id') id: string, @Body() body: IScimGroupPatchInput) {
    const updated = await this.scim.patchGroup(id, body.Operations ?? []);
    return this.scim.toScimGroup(updated);
  }

  @Delete('Groups/:id')
  async deleteGroup(@Param('id') id: string) {
    await this.scim.deleteGroup(id);
    return { status: 204 };
  }
}
