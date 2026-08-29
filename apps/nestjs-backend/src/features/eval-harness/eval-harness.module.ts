/**
 * NestJS module — registers the eval harness controller.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { EvalHarnessController } from './eval-harness.controller';

@Module({
  imports: [LicenseModule],
  controllers: [EvalHarnessController],
})
export class EvalHarnessModule {}
