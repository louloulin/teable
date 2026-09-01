/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk control — NestJS module wiring (Round-INFRA-2).
 *
 * Wraps `RiskControlService` into the NestJS container and registers
 * the admin HTTP controller. `LicenseModule` is imported so the
 * `LicenseCapabilityGuard` injected by `@UseGuards(...)` on
 * `RiskControlController` can resolve `LicenseCapabilityService`.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { RiskControlController } from './risk-control.controller';
import { RiskControlService } from './risk-control.service';

@Module({
  imports: [LicenseModule],
  controllers: [RiskControlController],
  providers: [RiskControlService],
  exports: [RiskControlService],
})
export class RiskControlModule {}
