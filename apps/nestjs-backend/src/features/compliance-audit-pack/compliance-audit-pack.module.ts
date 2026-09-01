/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { ComplianceAuditPackAuthService } from './compliance-audit-pack.auth.service';
import { ComplianceAuditPackController } from './compliance-audit-pack.controller';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [ComplianceAuditPackController],
  providers: [ComplianceAuditPackAuthService],
  exports: [ComplianceAuditPackAuthService],
})
export class ComplianceAuditPackModule {}
