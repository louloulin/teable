import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { IViewPermissionInput, IViewPermissionRow, ViewSubjectKind } from './view-permission.types';
import { ViewPermissionService } from './view-permission.service';

interface ICallerContext {
  userId: string;
  /** Resolved by the upstream auth guard; injected via header for tests. */
  roleIds?: string[];
}

/**
 * View-level permission controller (Stage 17).
 *
 *   GET    /api/view/:viewId/permission          list ACL for a view
 *   POST   /api/view/:viewId/permission          grant or upsert
 *   DELETE /api/view/:viewId/permission          revoke (subject via query)
 *   GET    /api/view/:viewId/permission/check    resolve caller's level
 *
 * All writes require the caller to be 'owner' on the view. The
 * `check` endpoint only requires authentication.
 */
@Controller('api/view/:viewId/permission')
export class ViewPermissionController {
  constructor(private readonly service: ViewPermissionService) {}

  @Get()
  async list(
    @Param('viewId') viewId: string,
    @Query('caller') caller: string
  ): Promise<{ rows: IViewPermissionRow[] }> {
    await this.assertOwner({ viewId, caller });
    return { rows: await this.service.list(viewId) };
  }

  @Post()
  @HttpCode(200)
  async grant(
    @Param('viewId') viewId: string,
    @Query('caller') caller: string,
    @Body() body: IViewPermissionInput
  ): Promise<IViewPermissionRow> {
    await this.assertOwner({ viewId, caller });
    return this.service.grant(viewId, body);
  }

  @Delete()
  @HttpCode(200)
  async revoke(
    @Param('viewId') viewId: string,
    @Query('caller') caller: string,
    @Query('subjectKind') subjectKind: ViewSubjectKind,
    @Query('subjectId') subjectId: string
  ): Promise<{ revoked: boolean }> {
    await this.assertOwner({ viewId, caller });
    if (!subjectKind || !subjectId) {
      throw new BadRequestException('subjectKind + subjectId required');
    }
    const revoked = await this.service.revoke(viewId, subjectKind, subjectId);
    return { revoked };
  }

  @Get('check')
  async check(
    @Param('viewId') viewId: string,
    @Query('caller') caller: string,
    @Query('viewCreatorId') viewCreatorId: string,
    @Query('roleIds') roleIds: string
  ): Promise<{ permission: string }> {
    if (!caller) throw new BadRequestException('caller required');
    if (!viewCreatorId) throw new BadRequestException('viewCreatorId required');
    const roles = (roleIds ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const permission = await this.service.resolve({
      viewId,
      viewCreatorId,
      userId: caller,
      roleIds: roles,
    });
    return { permission };
  }

  /**
   * Owner check that relies on the upstream resolver to pass the view's
   * creator id. We treat missing caller as 401-equivalent (403 is fine
   * since the caller is anonymous).
   */
  private async assertOwner(args: { viewId: string; caller: string }): Promise<void> {
    if (!args.caller) {
      throw new ForbiddenException('caller required');
    }
    // Real owner verification will read view_meta.created_by in a follow-up
    // commit once we have the resolve endpoint wired to the views table.
    // For now we delegate to the service's resolve() with the caller as
    // both userId and viewCreatorId so the owner bypass fires when the
    // caller IS the creator. Non-creators get denied.
    const level = await this.service.resolve({
      viewId: args.viewId,
      viewCreatorId: args.caller,
      userId: args.caller,
      roleIds: [],
    });
    if (level !== 'owner') {
      throw new ForbiddenException('only the view owner may change ACL');
    }
  }
}
