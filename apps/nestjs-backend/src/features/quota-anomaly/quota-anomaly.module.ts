/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Quota anomaly — NestJS module wiring (Stage 78).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { QuotaAnomalyAdminController } from './quota-anomaly.controller';
import { QuotaAnomalyAuthService } from './quota-anomaly.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [QuotaAnomalyAdminController],
  providers: [QuotaAnomalyAuthService],
  exports: [QuotaAnomalyAuthService],
})
export class QuotaAnomalyModule {}
