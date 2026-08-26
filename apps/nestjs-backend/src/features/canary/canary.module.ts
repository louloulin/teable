import { Module } from '@nestjs/common';
import { SettingModule } from '../setting/setting.module';
import { CanaryAuthService } from './canary.auth.service';
import { CanaryService } from './canary.service';
import { V2FeatureGuard } from './guards/v2-feature.guard';
import { V2IndicatorInterceptor } from './interceptors/v2-indicator.interceptor';

/**
 * Canary module — thin-DI wrapper (Stage N).
 *
 * Adds `CanaryAuthService` (a lightweight read-only "trip canary" entry
 * point) alongside the full V2 routing service. Existing guards / interceptor
 * exports are preserved verbatim so call-sites keep working.
 */
@Module({
  imports: [SettingModule],
  exports: [CanaryService, CanaryAuthService, V2FeatureGuard, V2IndicatorInterceptor],
  providers: [CanaryService, CanaryAuthService, V2FeatureGuard, V2IndicatorInterceptor],
})
export class CanaryModule {}
