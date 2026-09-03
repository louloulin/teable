import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { AllowAdminToken } from '../auth/decorators/admin-token.decorator';

import { BackupService } from './backup.service';
import type { IClsStore } from '../../types/cls';
import {
  ICreateBackupInput,
  IRestoreInput,
  IRestoreLogRow,
  ISnapshotRow,
  MergeMode,
} from './backup.types';

/**
 * Backup / restore controller (Stage 20).
 *
 *   GET    /api/backup?baseId=X             list snapshots for a base
 *   POST   /api/backup                      create snapshot
 *   GET    /api/backup/:id                  get one snapshot
 *   DELETE /api/backup/:id                  delete snapshot + archive
 *   POST   /api/backup/restore              start restore (synchronous in
 *                                            this stage; will move to a
 *                                            BullMQ queue in Stage 21+)
 *   GET    /api/backup/:id/restore-logs     list restore attempts
 */
/**
 * Backup / restore controller — operator-only.
 */
@Controller('api/backup')
@AllowAdminToken()
export class BackupController {
  constructor(
    private readonly service: BackupService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get()
  async list(
    @Query('baseId') baseId: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ snapshots: ISnapshotRow[] }> {
    this.assertAdmin(adminToken);
    if (!baseId) throw new BadRequestException('baseId required');
    return { snapshots: await this.service.listSnapshots(baseId) };
  }

  @Post()
  @HttpCode(200)
  async create(
    @Body() body: ICreateBackupInput,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<ISnapshotRow> {
    const createdBy = this.assertAdmin(adminToken);
    return this.service.createBackup({
      baseId: body.baseId,
      createdBy,
      archiveDir: body.archiveDir,
    });
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<ISnapshotRow> {
    this.assertAdmin(adminToken);
    const row = await this.service.getSnapshot(id);
    if (!row) throw new BadRequestException(`snapshot not found: ${id}`);
    return row;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ deleted: boolean }> {
    this.assertAdmin(adminToken);
    return { deleted: await this.service.deleteSnapshot(id) };
  }

  @Post('restore')
  @HttpCode(200)
  async restore(
    @Body() body: IRestoreInput,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<IRestoreLogRow> {
    this.assertAdmin(adminToken);
    return this.service.restore({
      snapshotId: body.snapshotId,
      targetBaseId: body.targetBaseId,
      mode: body.mode,
      archivePath: body.archivePath,
    });
  }

  @Get(':id/restore-logs')
  async logs(
    @Param('id') id: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ logs: IRestoreLogRow[] }> {
    this.assertAdmin(adminToken);
    return { logs: await this.service.listRestoreLogs(id) };
  }

  private assertAdmin(adminToken?: string): string {
    const user = this.cls.get('user');
    if (user?.id && user.isAdmin === true) return user.id;

    const expected = process.env.TEABLE_ADMIN_TOKEN;
    if (adminToken && expected) {
      const provided = Buffer.from(adminToken);
      const configured = Buffer.from(expected);
      if (provided.length === configured.length) {
        if (timingSafeEqual(provided, configured)) return 'admin-token';
      }
    }

    if (!user?.id) {
      throw new UnauthorizedException('backup requires an authenticated administrator');
    }
    throw new ForbiddenException('backup requires an administrator');
  }
}
