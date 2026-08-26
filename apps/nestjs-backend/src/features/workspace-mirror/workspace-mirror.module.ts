import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { WorkspaceMirrorConfigService } from './workspace-mirror.config.service';
import { WorkspaceMirrorController } from './workspace-mirror.controller';
import {
  batchRecords,
  buildBatchResult,
  computeLag,
  nextRecordId,
  nextSeq,
  pickNextStandby,
  summarizeLags,
  validateMirrorConfig,
} from './workspace-mirror.service';

/**
 * Pure-function helpers for workspace mirror — no Nest DI surface, consumed
 * directly by callers. Wave 6 surfaces that the previous thin-DI wrapper
 * class was never @Injectable() and could not be wired; we removed it.
 */
export const WorkspaceMirrorService = {
  nextRecordId,
  validateMirrorConfig,
  nextSeq,
  batchRecords,
  buildBatchResult,
  computeLag,
  summarizeLags,
  pickNextStandby,
};

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [WorkspaceMirrorController],
  providers: [WorkspaceMirrorConfigService],
  exports: [WorkspaceMirrorConfigService],
})
export class WorkspaceMirrorModule {}
