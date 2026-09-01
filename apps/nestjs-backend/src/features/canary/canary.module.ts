/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * canary — NestJS module wiring (Round-INFRA-7).
 *
 * Imports the LicenseModule so the `admin_panel` capability guard can
 * resolve its service. The canary service is reused as the controller
 * provider (this module has no separate auth.service.ts seam).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { SettingModule } from '../setting/setting.module';
import { CanaryController } from './canary.controller';
import { CanaryService } from './canary.service';
import { V2FeatureGuard } from './guards/v2-feature.guard';
import { V2IndicatorInterceptor } from './interceptors/v2-indicator.interceptor';

@Module({
  imports: [LicenseModule, SettingModule],
  controllers: [CanaryController],
  providers: [CanaryService, V2FeatureGuard, V2IndicatorInterceptor],
  exports: [CanaryService, V2FeatureGuard, V2IndicatorInterceptor],
})
export class CanaryModule {}
