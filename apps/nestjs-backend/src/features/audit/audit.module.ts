import { Global, Module } from '@nestjs/common';
import { AuditAuthService } from './audit.auth.service';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditScope } from './audit-scope';

/**
 * Audit module — thin-DI wrapper (Stage N).
 *
 * Adds `AuditAuthService` (read-only auth surface over the audit log)
 * alongside the existing write-side providers. Module is still `@Global()`
 * so existing consumers (decorators, interceptors) keep working unchanged.
 */
@Global()
@Module({
  providers: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService],
  exports: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService],
})
export class AuditSourceModule {}
