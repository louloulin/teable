import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { EnterpriseReadinessController } from './enterprise-readiness.controller';
import { EnterpriseReadinessService } from './enterprise-readiness.service';

/**
 * Single-purpose module that mounts `/api/admin/enterprise-readiness`.
 *
 * Pulls in `PrismaModule` (counts from the main DB) and `LicenseModule`
 * (per-capability gating). No other dependencies — the readiness report
 * is a pure aggregator and never mutates any state.
 */
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [EnterpriseReadinessController],
  providers: [EnterpriseReadinessService],
  exports: [EnterpriseReadinessService],
})
export class EnterpriseReadinessModule {}
