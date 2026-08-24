import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { ApiThrottleGuard } from './api-rate-limit.guard';

/**
 * Hosts `ApiThrottleGuard` and depends on `LicenseModule` so the guard
 * can read the live plan from `LicenseCapabilityService.currentPlan()`.
 *
 * Registered as a global `APP_GUARD` in `global.module.ts`. Imported by
 * `appModules.imports` next to `LicenseModule` so the DI graph stays
 * explicit even though `LicenseModule` is already in `GlobalModule`.
 */
@Module({
  imports: [LicenseModule],
  providers: [ApiThrottleGuard],
  exports: [ApiThrottleGuard],
})
export class ApiRateLimitModule {}
