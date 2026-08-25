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

import { BackupService } from './backup.service';
import {
  ICreateBackupInput,
  IRestoreInput,
  IRestoreLogRow,
  ISnapshotRow,
  MergeMode,
} from './backup.types';

interface IAdminCaller {
  admin?: boolean;
}

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
@Controller('api/backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Get()
  async list(
    @Query('baseId') baseId: string,
    @Query('actor') actor: string
  ): Promise<{ snapshots: ISnapshotRow[] }> {
    this.assertAdmin(actor);
    if (!baseId) throw new BadRequestException('baseId required');
    return { snapshots: await this.service.listSnapshots(baseId) };
  }

  @Post()
  @HttpCode(200)
  async create(@Body() body: ICreateBackupInput & { actor?: IAdminCaller }): Promise<ISnapshotRow> {
    if (!body?.actor?.admin) throw new ForbiddenException('admin scope required');
    return this.service.createBackup({
      baseId: body.baseId,
      createdBy: body.createdBy,
      archiveDir: body.archiveDir,
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Query('actor') actor: string): Promise<ISnapshotRow> {
    this.assertAdmin(actor);
    const row = await this.service.getSnapshot(id);
    if (!row) throw new BadRequestException(`snapshot not found: ${id}`);
    return row;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Query('actor') actor: string
  ): Promise<{ deleted: boolean }> {
    this.assertAdmin(actor);
    return { deleted: await this.service.deleteSnapshot(id) };
  }

  @Post('restore')
  @HttpCode(200)
  async restore(@Body() body: IRestoreInput & { actor?: IAdminCaller }): Promise<IRestoreLogRow> {
    if (!body?.actor?.admin) throw new ForbiddenException('admin scope required');
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
    @Query('actor') actor: string
  ): Promise<{ logs: IRestoreLogRow[] }> {
    this.assertAdmin(actor);
    return { logs: await this.service.listRestoreLogs(id) };
  }

  private assertAdmin(actor: string): void {
    // Real auth wiring belongs in a follow-up stage; we accept any
    // explicit actor string as the proxy so the endpoint surfaces a
    // 401-equivalent when unauthenticated.
    if (!actor) throw new ForbiddenException('actor required');
  }
}
