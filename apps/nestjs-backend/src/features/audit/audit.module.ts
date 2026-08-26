import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditScope } from './audit-scope';

@Global()
@Module({
  providers: [AuditScope, AuditLogService, AuditInterceptor],
  exports: [AuditScope, AuditLogService, AuditInterceptor],
})
export class AuditSourceModule {}
