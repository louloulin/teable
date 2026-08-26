/**
 * Workspace Mirror — HTTP surface for the workspace-switcher UI.
 *
 * The mirror feature previously shipped as helpers only, with no route to hit.
 * These are the minimal CRUD endpoints the switcher and the mirror settings
 * panel need. Nothing here touches an existing handler path.
 *
 * Permissions:
 *   - `GET /configs` is session-only — it has no baseId to guard on and only
 *     ever returns configs the caller created.
 *   - every base-scoped route declares `space|update`, which only Owner holds
 *     (Creator and below are false in `RolePermission`), i.e. space admin.
 *     `PermissionGuard` resolves the resource from `params.baseId`, or from
 *     `body.baseId` on create via `@ResourceMeta`.
 *   - the whole controller sits behind the `workspace_mirror` license
 *     capability, which is advisory on a self-hosted install and enforced on
 *     Business+ — same pattern as `sso.controller.ts`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { IClsStore } from '../../types/cls';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ResourceMeta } from '../auth/decorators/resource_meta.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import {
  MirrorConfigNotFoundError,
  MirrorConfigValidationError,
  WorkspaceMirrorConfigService,
} from './workspace-mirror.config.service';
import type {
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
} from './workspace-mirror.types';

const WorkspaceMirrorGuard = LicenseCapabilityGuard.for('workspace_mirror');

/** Max log rows one request may pull back. */
const LOG_PAGE_SIZE = 100;

/**
 * Reject obviously malformed bodies before `validateMirrorConfig` runs — that
 * helper assumes `primary` and `standbys` are present and would throw a
 * TypeError rather than return a readable error list.
 */
function assertConfigShape(body: unknown): asserts body is IMirrorConfig {
  const cfg = body as Partial<IMirrorConfig> | null;
  const errors: string[] = [];
  if (!cfg || typeof cfg !== 'object') {
    throw new BadRequestException('mirror config body is required');
  }
  if (typeof cfg.baseId !== 'string' || cfg.baseId === '') errors.push('baseId is required');
  if (!cfg.primary || typeof cfg.primary !== 'object') {
    errors.push('primary endpoint is required');
  }
  if (!Array.isArray(cfg.standbys)) errors.push('standbys must be an array');
  if (typeof cfg.maxLagSeconds !== 'number') errors.push('maxLagSeconds must be a number');
  if (typeof cfg.batchSize !== 'number') errors.push('batchSize must be a number');
  if (typeof cfg.enabled !== 'boolean') errors.push('enabled must be a boolean');
  if (errors.length > 0) {
    throw new BadRequestException(errors.join('; '));
  }
}

@Controller('api/workspace-mirror')
@UseGuards(WorkspaceMirrorGuard)
export class WorkspaceMirrorController {
  constructor(
    private readonly configService: WorkspaceMirrorConfigService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('configs')
  listConfigs(): IMirrorConfig[] {
    return this.configService.list(this.currentUserId());
  }

  @Post('configs')
  @Permissions('space|update')
  @ResourceMeta('baseId', 'body')
  createConfig(@Body() body: unknown): IMirrorConfig {
    assertConfigShape(body);
    try {
      return this.configService.upsert(body, this.currentUserId());
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get('configs/:baseId')
  @Permissions('space|update')
  getConfig(@Param('baseId') baseId: string): IMirrorConfig {
    try {
      return this.configService.get(baseId);
    } catch (err) {
      throw this.translate(err);
    }
  }

  /** Worst-case standby lag — what `MirrorStatusBadge` renders. */
  @Get('configs/:baseId/lag')
  @Permissions('space|update')
  async getLag(@Param('baseId') baseId: string): Promise<IMirrorLag> {
    try {
      return await this.configService.worstLag(baseId);
    } catch (err) {
      throw this.translate(err);
    }
  }

  /** Per-standby lag plus `safeToPromote` — what the settings panel renders. */
  @Get('configs/:baseId/status')
  @Permissions('space|update')
  async getStatus(@Param('baseId') baseId: string): Promise<IMirrorQueryResult> {
    try {
      return await this.configService.statusOf(baseId);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Post('configs/:baseId/pause')
  @Permissions('space|update')
  pause(@Param('baseId') baseId: string): IMirrorConfig {
    try {
      return this.configService.setEnabled(baseId, false);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Post('configs/:baseId/resume')
  @Permissions('space|update')
  resume(@Param('baseId') baseId: string): IMirrorConfig {
    try {
      return this.configService.setEnabled(baseId, true);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get('configs/:baseId/logs')
  @Permissions('space|update')
  async getLogs(
    @Param('baseId') baseId: string,
    @Query('since') since?: string
  ): Promise<IMirrorLogRecord[]> {
    try {
      return await this.configService.logs(baseId, since, LOG_PAGE_SIZE);
    } catch (err) {
      throw this.translate(err);
    }
  }

  private currentUserId(): string {
    const userId = this.cls.get('user')?.id;
    if (!userId) {
      // AuthGuard runs ahead of this controller, so an absent user means the
      // request bypassed it — refuse rather than bucket configs under a
      // shared fallback id.
      throw new BadRequestException('mirror config requires an authenticated user');
    }
    return userId;
  }

  /** Map service-level errors onto the HTTP surface. */
  private translate(err: unknown): Error {
    if (err instanceof MirrorConfigValidationError) {
      return new BadRequestException(err.errors.join('; '));
    }
    if (err instanceof MirrorConfigNotFoundError) {
      return new NotFoundException(err.message);
    }
    return err as Error;
  }
}
