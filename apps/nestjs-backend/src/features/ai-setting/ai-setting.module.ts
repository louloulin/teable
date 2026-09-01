/**
 * AI Admin Setting — NestJS module (Round-AI-3).
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { SettingModule } from '../setting/setting.module';
import { AiSettingController } from './ai-setting.controller';
import { AiSettingAuthService } from './ai-setting.auth.service';

@Module({
  imports: [LicenseModule, SettingModule],
  controllers: [AiSettingController],
  providers: [AiSettingAuthService],
  exports: [AiSettingAuthService],
})
export class AiSettingModule {}
