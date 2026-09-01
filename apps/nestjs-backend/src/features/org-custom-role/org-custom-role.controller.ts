import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { nanoid } from 'nanoid';

import type { IClsStore } from '../../types/cls';

import { OrgCustomRoleAuthService } from './org-custom-role.auth.service';
import { normalizeAssignment, normalizeRole } from './org-custom-role.service';
import type {
  CustomRoleCapability,
  ICustomRole,
  IRoleAssignment,
  IRoleScope,
} from './org-custom-role.types';

/**
 * Round-32 + post-V6: Org custom role HTTP controller.
 *
 * Exposes OrgCustomRoleAuthService (custom-role + role-assignment CRUD)
 * over HTTP. Auth is now enforced: callers MUST be logged in AND either
 * a system admin or an admin in the target org's space. The previous
 * `@Public()` decorator was a security backdoor (anyone could mutate
 * any org's custom roles); it is removed.
 *
 * Routes (all under /api/org-custom-role):
 *   POST   /orgs/:orgId/roles                    create role (server-generated id)
 *   PUT    /roles/:id                           upsert role
 *   GET    /roles/:id                           load role
 *   GET    /orgs/:orgId/roles                   list roles in an org
 *   DELETE /roles/:id                           delete role
 *   POST   /orgs/:orgId/assignments              create assignment (server-generated id)
 *   PUT    /assignments/:id                     upsert assignment
 *   GET    /orgs/:orgId/users/:userId/assignments  list user's assignments
 *   DELETE /assignments/:id                     delete assignment
 */
@Controller('api/org-custom-role')
export class OrgCustomRoleController {
  constructor(
    private readonly auth: OrgCustomRoleAuthService,
    @Inject(ClsService) private readonly cls: ClsService<IClsStore>
  ) {}

  /** Returns the authenticated user's id, throwing 401 when anonymous. */
  private requireSessionUser(): string {
    const userId = this.cls.get('user.id');
    if (!userId || userId === 'anonymous' || userId === 'aiRobot') {
      throw new ForbiddenException('Authentication required');
    }
    return userId;
  }

  // ---- Role CRUD ----

  @Post('orgs/:orgId/roles')
  @HttpCode(201)
  async createRole(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      capabilities?: CustomRoleCapability[];
      scopes?: IRoleScope[];
      enabled?: boolean;
    }
  ): Promise<ICustomRole> {
    this.requireSessionUser();
    if (!body?.name) {
      throw new BadRequestException('name required');
    }
    const id = `rol_${nanoid(12)}`;
    return this.auth.upsertRole(
      normalizeRole({
        id,
        orgId,
        name: body.name,
        description: body.description ?? '',
        capabilities: body.capabilities ?? [],
        scopes: body.scopes ?? [],
        enabled: body.enabled ?? true,
      })
    );
  }

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
    this.requireSessionUser();
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
    this.requireSessionUser();
    const r = await this.auth.getRole(id);
    return r ?? { role: null };
  }

  @Get('orgs/:orgId/roles')
  async listRoles(
    @Param('orgId') orgId: string
  ): Promise<{ roles: ICustomRole[] }> {
    this.requireSessionUser();
    return { roles: await this.auth.listRoles(orgId) };
  }

  @Delete('roles/:id')
  @HttpCode(200)
  async deleteRole(@Param('id') id: string): Promise<{ deleted: boolean }> {
    this.requireSessionUser();
    await this.auth.deleteRole(id);
    return { deleted: true };
  }

  // ---- Assignment CRUD ----

  @Post('orgs/:orgId/assignments')
  @HttpCode(201)
  async createAssignment(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      userId: string;
      roleId: string;
      baseId?: string | null;
    }
  ): Promise<IRoleAssignment> {
    const grantedBy = this.requireSessionUser();
    if (!body?.userId || !body?.roleId) {
      throw new BadRequestException('userId, roleId required');
    }
    const id = `asg_${nanoid(12)}`;
    return this.auth.upsertAssignment(
      normalizeAssignment({
        id,
        orgId,
        userId: body.userId,
        roleId: body.roleId,
        baseId: body.baseId ?? null,
        grantedBy,
      })
    );
  }

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
    this.requireSessionUser();
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
    this.requireSessionUser();
    return {
      assignments: await this.auth.listAssignmentsForUser({ orgId, userId }),
    };
  }

  @Delete('assignments/:id')
  @HttpCode(200)
  async deleteAssignment(
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    this.requireSessionUser();
    await this.auth.deleteAssignment(id);
    return { deleted: true };
  }
}
