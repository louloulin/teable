/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk event query — NestJS module wiring (Round-INFRA-7).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { RiskEventQueryAuthService } from './risk-event-query.auth.service';
import { RiskEventQueryAdminController } from './risk-event-query.controller';

@Module({
  imports: [LicenseModule],
  controllers: [RiskEventQueryAdminController],
  providers: [RiskEventQueryAuthService],
  exports: [RiskEventQueryAuthService],
})
export class RiskEventQueryModule {}
