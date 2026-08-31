/**
 * Custom AI Model — NestJS module.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { CustomAiModelController } from './custom-ai-model.controller';
import { CustomAiModelAuthService } from './custom-ai-model.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [CustomAiModelController],
  providers: [CustomAiModelAuthService],
  exports: [CustomAiModelAuthService],
})
export class CustomAiModelModule {}
