import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';

/**
 * Stage 7 admin-panel read-side module.
 *
 * Imports `PrismaModule` and `LicenseModule`. The service talks to Prisma
 * directly so the module doesn't pull in `UserModule` / `SpaceModule` /
 * `QuotaModule` / `SettingModule` (each of which would drag a larger
 * dependency graph — storage, risk control, performance cache — that the
 * admin panel does not need).
 *
 * `LicenseModule` is required because the route-level
 * `LicenseCapabilityGuard` injected by `@UseGuards(guardFor(cap))` depends
 * on `LicenseCapabilityService`. Without this import the guard's DI graph
 * can't resolve in the AdminOpenApiModule scope.
 */
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AdminOpenApiController],
  providers: [AdminOpenApiService],
  exports: [AdminOpenApiService],
})
export class AdminOpenApiModule {}
