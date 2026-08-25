import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/**
 * Backup / restore module — Stage 20.
 *
 * Provides a base-scoped point-in-time backup + restore API. Snapshots
 * are written to a configurable on-disk directory (TEABLE_BACKUP_DIR or
 * /tmp/teable-backups) as gzipped JSON manifests. A future stage will
 * move restore into a BullMQ queue so long restores don't block the
 * HTTP request; for now we run them synchronously and surface the
 * result via the restore-log row.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
