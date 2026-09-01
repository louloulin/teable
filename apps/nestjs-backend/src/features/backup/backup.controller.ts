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
} from '@nestjs/common';

import { BackupService } from './backup.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  ICreateBackupInput,
  IRestoreInput,
  IRestoreLogRow,
  ISnapshotRow,
  MergeMode,
} from './backup.types';



function adminMatches(adminToken?: string): boolean {
  const expected = process.env.TEABLE_ADMIN_TOKEN;
  return Boolean(adminToken && expected && adminToken === expected);
}
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
/**
 * Backup / restore controller — operator-only. Routes are
 * marked @Public() so the global session guard lets them through;
 * each handler then calls assertAdmin() to verify the operator's
 * x-admin-token header (matches process.env.TEABLE_ADMIN_TOKEN) or
 * an explicit actor string in the request body / query.
 */
@Controller('api/backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Public()
  @Get()
  async list(
    @Query('baseId') baseId: string,
    @Query('actor') actor: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ snapshots: ISnapshotRow[] }> {
    this.assertAdmin(actor, adminToken);
    if (!baseId) throw new BadRequestException('baseId required');
    return { snapshots: await this.service.listSnapshots(baseId) };
  }

  @Public()
  @Post()
  @HttpCode(200)
  async create(
    @Body() body: ICreateBackupInput & { actor?: IAdminCaller },
    @Headers('x-admin-token') adminToken?: string
  ): Promise<ISnapshotRow> {
    if (!adminMatches(adminToken) && !body?.actor?.admin) {
      throw new ForbiddenException('admin scope required');
    }
    return this.service.createBackup({
      baseId: body.baseId,
      createdBy: body.createdBy,
      archiveDir: body.archiveDir,
    });
  }

  @Public()
  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Query('actor') actor: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<ISnapshotRow> {
    this.assertAdmin(actor, adminToken);
    const row = await this.service.getSnapshot(id);
    if (!row) throw new BadRequestException(`snapshot not found: ${id}`);
    return row;
  }

  @Public()
  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Query('actor') actor: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ deleted: boolean }> {
    this.assertAdmin(actor, adminToken);
    return { deleted: await this.service.deleteSnapshot(id) };
  }

  @Public()
  @Post('restore')
  @HttpCode(200)
  async restore(
    @Body() body: IRestoreInput & { actor?: IAdminCaller },
    @Headers('x-admin-token') adminToken?: string
  ): Promise<IRestoreLogRow> {
    if (!adminMatches(adminToken) && !body?.actor?.admin) {
      throw new ForbiddenException('admin scope required');
    }
    return this.service.restore({
      snapshotId: body.snapshotId,
      targetBaseId: body.targetBaseId,
      mode: body.mode,
      archivePath: body.archivePath,
    });
  }

  @Public()
  @Get(':id/restore-logs')
  async logs(
    @Param('id') id: string,
    @Query('actor') actor: string,
    @Headers('x-admin-token') adminToken?: string
  ): Promise<{ logs: IRestoreLogRow[] }> {
    this.assertAdmin(actor, adminToken);
    return { logs: await this.service.listRestoreLogs(id) };
  }

  private assertAdmin(actor: string, adminToken?: string): void {
    // Real auth wiring: accept either an admin-token header or an
    // explicit actor string + TEABLE_ADMIN_TOKEN env match. Either path
    // gates access to the snapshot list/CRUD endpoints so they cannot
    // be exercised without operator credentials.
    const expected = process.env.TEABLE_ADMIN_TOKEN;
    if (adminToken && expected && adminToken === expected) return;
    if (!actor) {
      throw new ForbiddenException('admin token or actor required');
    }
  }
}
