/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Billing Rollup — NestJS module wiring (Round-INFRA-7).
 *
 * Wraps OrgBillingRollupAuthService into the NestJS container so
 * the admin / finance console can load rollups while the
 * billing-runner keeps producing them on the AuthService.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { OrgBillingRollupAuthService } from './org-billing-rollup.auth.service';
import { OrgBillingRollupController } from './org-billing-rollup.controller';

@Module({
  imports: [LicenseModule],
  controllers: [OrgBillingRollupController],
  providers: [OrgBillingRollupAuthService],
  exports: [OrgBillingRollupAuthService],
})
export class OrgBillingRollupModule {}
