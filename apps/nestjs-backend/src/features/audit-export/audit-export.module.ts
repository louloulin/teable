import { Module } from '@nestjs/common';
import { AuditExportAuthService } from './audit-export.auth.service';
import { AuditExportController } from './audit-export.controller';

@Module({
  controllers: [AuditExportController],
  providers: [AuditExportAuthService],
  exports: [AuditExportAuthService],
})
export class AuditExportModule {}
