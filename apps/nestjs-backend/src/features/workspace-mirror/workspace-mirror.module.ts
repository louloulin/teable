import { Module } from '@nestjs/common';

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

@Module({})
export class WorkspaceMirrorModule {}
