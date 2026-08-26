import { Global, Module } from '@nestjs/common';
import { AuditAdminController } from './audit.controller';
import { AuditAuthService } from './audit.auth.service';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditScope } from './audit-scope';

/**
 * Audit module — thin-DI wrapper (Stage N) + R1-T03 admin bridge.
 *
 * Adds `AuditAuthService` (read-only auth surface over the audit log)
 * alongside the existing write-side providers. Module is still `@Global()`
 * so existing consumers (decorators, interceptors) keep working unchanged.
 *
 * R1-T03 also wires `AuditAdminController` so the admin UI can list and
 * summarise audit rows over HTTP. The controller is admin-gated via
 * `LicenseCapabilityGuard.for('audit_log')` so only Business / Enterprise
 * plans (or self-host ops with the capability unlocked) can hit the routes.
 */
@Global()
@Module({
  providers: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService],
  exports: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService],
  controllers: [AuditAdminController],
})
export class AuditSourceModule {}