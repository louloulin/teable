import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { OrgCustomRoleAuthService } from './org-custom-role.auth.service';
import { normalizeAssignment, normalizeRole } from './org-custom-role.service';
import type {
  CustomRoleCapability,
  ICustomRole,
  IRoleAssignment,
  IRoleScope,
} from './org-custom-role.types';

/**
 * Round-32: Org custom role HTTP controller.
 *
 * Exposes OrgCustomRoleAuthService (custom-role + role-assignment CRUD)
 * over HTTP. Without this controller, the custom_role capability is
 * unreachable — same "service exists, no surface" gap that R28/R29/R30/R31
 * fixed for other features. This is the operational twin to
 * authority-matrix (R26): custom roles + assignments let admins build
 * fine-grained per-user permissions on top of the built-in matrix.
 *
 * Routes (all under /api/org-custom-role):
 *   PUT    /roles/:id                           upsert role
 *   GET    /roles/:id                           load role
 *   GET    /orgs/:orgId/roles                   list roles in an org
 *   DELETE /roles/:id                           delete role
 *   PUT    /assignments/:id                     upsert assignment
 *   GET    /orgs/:orgId/users/:userId/assignments  list user's assignments
 *   DELETE /assignments/:id                     delete assignment
 */
@Public()
@Controller('api/org-custom-role')
export class OrgCustomRoleController {
  constructor(private readonly auth: OrgCustomRoleAuthService) {}

  // ---- Role CRUD ----

  @Put('roles/:id')
  @HttpCode(200)
  async upsertRole(
    @Param('id') id: string,
    @Body()
    body: {
      orgId: string;
      name: string;
      description?: string;
      capabilities?: CustomRoleCapability[];
      scopes?: IRoleScope[];
      enabled?: boolean;
    }
  ): Promise<ICustomRole> {
    if (!body?.orgId || !body?.name) {
      throw new BadRequestException('orgId, name required');
    }
    return this.auth.upsertRole(
      normalizeRole({
        id,
        orgId: body.orgId,
        name: body.name,
        description: body.description ?? '',
        capabilities: body.capabilities ?? [],
        scopes: body.scopes ?? [],
        enabled: body.enabled ?? true,
      })
    );
  }

  @Get('roles/:id')
  async loadRole(@Param('id') id: string): Promise<ICustomRole | { role: null }> {
    const r = await this.auth.getRole(id);
    return r ?? { role: null };
  }

  @Get('orgs/:orgId/roles')
  async listRoles(
    @Param('orgId') orgId: string
  ): Promise<{ roles: ICustomRole[] }> {
    return { roles: await this.auth.listRoles(orgId) };
  }

  @Delete('roles/:id')
  @HttpCode(200)
  async deleteRole(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.auth.deleteRole(id);
    return { deleted: true };
  }

  // ---- Assignment CRUD ----

  @Put('assignments/:id')
  @HttpCode(200)
  async upsertAssignment(
    @Param('id') id: string,
    @Body()
    body: {
      orgId: string;
      userId: string;
      roleId: string;
      baseId?: string | null;
      grantedBy: string;
    }
  ): Promise<IRoleAssignment> {
    if (
      !body?.orgId ||
      !body?.userId ||
      !body?.roleId ||
      !body?.grantedBy
    ) {
      throw new BadRequestException('orgId, userId, roleId, grantedBy required');
    }
    return this.auth.upsertAssignment(
      normalizeAssignment({
        id,
        orgId: body.orgId,
        userId: body.userId,
        roleId: body.roleId,
        baseId: body.baseId ?? null,
        grantedBy: body.grantedBy,
      })
    );
  }

  @Get('orgs/:orgId/users/:userId/assignments')
  async listAssignments(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string
  ): Promise<{ assignments: IRoleAssignment[] }> {
    return {
      assignments: await this.auth.listAssignmentsForUser({ orgId, userId }),
    };
  }

  @Delete('assignments/:id')
  @HttpCode(200)
  async deleteAssignment(
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    await this.auth.deleteAssignment(id);
    return { deleted: true };
  }
}
