/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk policy — NestJS module wiring (Round-INFRA-7).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { RiskPolicyAuthService } from './risk-policy.auth.service';
import { RiskPolicyAdminController } from './risk-policy.controller';

@Module({
  imports: [LicenseModule],
  controllers: [RiskPolicyAdminController],
  providers: [RiskPolicyAuthService],
  exports: [RiskPolicyAuthService],
})
export class RiskPolicyModule {}
