/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Quota — NestJS module wiring (Round-INFRA-7).
 *
 * Wraps OrgQuotaAuthService into the NestJS container so the
 * admin panel can probe envelopes and overage ledgers while the
 * request interceptor hot-path stays on AuthService.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { OrgQuotaAuthService } from './org-quota.auth.service';
import { OrgQuotaController } from './org-quota.controller';

@Module({
  imports: [LicenseModule],
  controllers: [OrgQuotaController],
  providers: [OrgQuotaAuthService],
  exports: [OrgQuotaAuthService],
})
export class OrgQuotaModule {}
