/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — NestJS module wiring (Round-INFRA-4).
 *
 * Wraps BillingAuthService into the NestJS container so other
 * feature modules can import this one (and so the capability gate
 * in `/api/admin/enterprise-readiness` can probe it via app.module).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { BillingController } from './billing.controller';
import { BillingAuthService } from './billing.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [BillingController],
  providers: [BillingAuthService],
  exports: [BillingAuthService],
})
export class BillingModule {}
