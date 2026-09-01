/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { CompliancePolicyEngineAuthService } from './compliance-policy-engine.auth.service';
import { CompliancePolicyEngineController } from './compliance-policy-engine.controller';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [CompliancePolicyEngineController],
  providers: [CompliancePolicyEngineAuthService],
  exports: [CompliancePolicyEngineAuthService],
})
export class CompliancePolicyEngineModule {}
