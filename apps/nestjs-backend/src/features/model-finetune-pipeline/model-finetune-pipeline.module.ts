/**
 * NestJS module — registers the fine-tune controller.
 *
 * `FEEDBACK_LOADER` is an `@Inject`-style token that production wires to a
 * Prisma-backed implementation reading from `ai_builder_feedback`.  Tests
 * pass an in-memory loader.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { ModelFinetunePipelineController } from './model-finetune-pipeline.controller';

@Module({
  controllers: [ModelFinetunePipelineController],
})
export class ModelFinetunePipelineModule {}
