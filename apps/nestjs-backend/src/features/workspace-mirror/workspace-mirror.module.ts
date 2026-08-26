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
import { WorkspaceMirrorAuthService } from './workspace-mirror.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `workspace-mirror.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class WorkspaceMirrorService {
  nextRecordId = nextRecordId;
  validateMirrorConfig = validateMirrorConfig;
  nextSeq = nextSeq;
  batchRecords = batchRecords;
  buildBatchResult = buildBatchResult;
  computeLag = computeLag;
  summarizeLags = summarizeLags;
  pickNextStandby = pickNextStandby;
}

@Module({
  providers: [WorkspaceMirrorService, WorkspaceMirrorAuthService],
  exports: [WorkspaceMirrorService, WorkspaceMirrorAuthService],
})
export class WorkspaceMirrorModule {}
