/**
 * NestJS module — registers the eval harness controller.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { EvalHarnessController } from './eval-harness.controller';

@Module({
  controllers: [EvalHarnessController],
})
export class EvalHarnessModule {}
