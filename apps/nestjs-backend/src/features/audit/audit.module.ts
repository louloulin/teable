import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { AuditLogController, AuditOperationsSummaryController } from './audit-log.controller';
import { AuditLogListener } from './audit-log.listener';
import { AuditLogService } from './audit-log.service';
import { AuditScope } from './audit-scope';
import { RecordAuditListener } from './record-audit.listener';

/**
 * Audit module — exposes both the in-process emission helpers used by
 * every audit-aware service (`AuditScope`, `@Audit`) and the admin-side
 * read endpoint (`AuditLogController`).
 *
 * Marked `@Global()` so `AuditScope` is injectable everywhere without
 * each feature module having to re-import it. The `AuditLogController` is
 * exported as a route, not a provider — its registration only requires
 * this module to be in the root `AppModule.imports`.
 */
@Global()
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AuditLogController, AuditOperationsSummaryController],
  providers: [AuditScope, AuditLogListener, AuditLogService, RecordAuditListener],
  exports: [AuditScope, AuditLogService],
})
export class AuditSourceModule {}
