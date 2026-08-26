/**
 * Teable Open Source — AGPL-3.0 license.
 *
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
 *
 * R1-T04 rewires this module through `createFeatureModule` as the first
 * call-site proof for the factory. Behaviour is identical:
 *   - providers: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService]
 *   - exports:   same four
 *   - controllers: [AuditAdminController]
 *   - global: true (still registered with `@Global()` via the wrapping module)
 */
import { Global, Module } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AuditAdminController } from './audit.controller';
import { AuditAuthService } from './audit.auth.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogService } from './audit-log.service';
import { AuditScope } from './audit-scope';
import { listAuditOperationsQuerySchema } from './audit.query.schema';
import { createFeatureModule } from '../../factory';

/**
 * The thin-DI audit feature — wired via `createFeatureModule`. Behaviour
 * mirrors the pre-T-04 `@Module()` decorator block: same providers,
 * same exports, same controllers, same `@Global()` wrap.
 */
const auditFeature = createFeatureModule({
  name: 'audit',
  service: AuditAuthService,
  controller: AuditAdminController,
  querySchema: listAuditOperationsQuerySchema,
  guards: [LicenseCapabilityGuard.for('audit_log')],
  providers: [AuditScope, AuditLogService, AuditInterceptor],
  exportedProviders: [AuditScope, AuditLogService, AuditInterceptor, AuditAuthService],
  global: true,
});

/**
 * Public module class — NestJS still sees this `@Global() @Module({ imports: [...] })`
 * wrapper. The actual provider / controller / export wiring lives in
 * `auditFeature` (see R1-T04).
 */
@Global()
@Module({
  imports: [auditFeature.module],
})
export class AuditSourceModule {}
