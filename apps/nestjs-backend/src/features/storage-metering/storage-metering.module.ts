/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Storage metering — NestJS module wiring (Round-INFRA-2).
 *
 * Wraps `StorageMeteringAuthService` into the NestJS container and
 * registers the admin HTTP controller. `LicenseModule` is imported so
 * the `LicenseCapabilityGuard` injected by `@UseGuards(...)` on
 * `StorageMeteringController` can resolve `LicenseCapabilityService`.
 * `PrismaModule` is global, so no explicit import is needed.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { StorageMeteringAuthService } from './storage-metering.auth.service';
import { StorageMeteringController } from './storage-metering.controller';

@Module({
  imports: [LicenseModule],
  controllers: [StorageMeteringController],
  providers: [StorageMeteringAuthService],
  exports: [StorageMeteringAuthService],
})
export class StorageMeteringModule {}
