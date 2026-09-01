/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Seat metering — NestJS module wiring (Round-INFRA-2).
 *
 * Wraps `SeatMeteringAuthService` into the NestJS container and
 * registers the admin HTTP controller. `LicenseModule` is imported so
 * the `LicenseCapabilityGuard` injected by `@UseGuards(...)` on
 * `SeatMeteringController` can resolve `LicenseCapabilityService`.
 * `PrismaModule` is global, so no explicit import is needed.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { SeatMeteringAuthService } from './seat-metering.auth.service';
import { SeatMeteringController } from './seat-metering.controller';

@Module({
  imports: [LicenseModule],
  controllers: [SeatMeteringController],
  providers: [SeatMeteringAuthService],
  exports: [SeatMeteringAuthService],
})
export class SeatMeteringModule {}
