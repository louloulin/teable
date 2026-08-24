import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';

/**
 * Stage 7 admin-panel read-side module.
 *
 * Intentionally only imports `PrismaModule`. The service talks to Prisma
 * directly so the module never pulls in `UserModule` / `SpaceModule` /
 * `QuotaModule` / `SettingModule` (each of which would drag a larger
 * dependency graph — storage, risk control, performance cache — that the
 * admin panel does not need).
 *
 * Wiring `LicenseModule` here would be redundant: the guard already has
 * access to `LicenseCapabilityService` via its own DI graph.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminOpenApiController],
  providers: [AdminOpenApiService],
  exports: [AdminOpenApiService],
})
export class AdminOpenApiModule {}