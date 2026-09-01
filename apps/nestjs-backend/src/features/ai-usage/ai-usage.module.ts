/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * AI usage — NestJS module wiring (Round-INFRA-3).
 *
 * Wraps AiUsageAuthService into the NestJS container so other
 * feature modules can import this one (and so the capability gate
 * in `/api/admin/enterprise-readiness` can probe it via app.module).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { AiUsageController } from './ai-usage.controller';
import { AiUsageAuthService } from './ai-usage.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [AiUsageController],
  providers: [AiUsageAuthService],
  exports: [AiUsageAuthService],
})
export class AiUsageModule {}
