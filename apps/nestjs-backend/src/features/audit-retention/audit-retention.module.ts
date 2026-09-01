/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Audit retention — NestJS module wiring (Round-INFRA-7).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { AuditRetentionAdminController } from './audit-retention.controller';
import { AuditRetentionAuthService } from './audit-retention.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [AuditRetentionAdminController],
  providers: [AuditRetentionAuthService],
  exports: [AuditRetentionAuthService],
})
export class AuditRetentionModule {}
