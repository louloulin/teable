import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '@teable/db-main-prisma';

import { QuotaController } from './quota.controller';
import { QuotaEnforcementInterceptor } from './quota.interceptor';
import { QuotaService } from './quota.service';

/**
 * QuotaModule exposes:
 *   - QuotaController: admin endpoints (GET/PUT /api/quota/:spaceId)
 *   - QuotaService: read+write surface for the quota subsystem
 *   - QuotaEnforcementInterceptor: APP_INTERCEPTOR (env-gated)
 *
 * The bare `@Module(...)` decorator keeps the controller + service available
 * for direct injection; QuotaEnforcementInterceptor is exported so test
 * fixtures can instantiate it without registering the global hookup.
 *
 * Use `QuotaModule.forRoot()` from the application root when you want the
 * global APP_INTERCEPTOR wiring. The factory is env-gated:
 *
 *   - `TEABLE_QUOTA_ENFORCEMENT_ENABLED !== 'true'` → returns a bare
 *     DynamicModule with NO APP_INTERCEPTOR provider. OSS self-host keeps
 *     zero-cost path (interceptor never instantiated, never called).
 *   - `TEABLE_QUOTA_ENFORCEMENT_ENABLED === 'true'`  → registers
 *     QuotaEnforcementInterceptor as APP_INTERCEPTOR. Every controller call
 *     now runs `QuotaService.consume(...)` first and rejects with
 *     `QuotaExceededException` (HTTP 402, cause `'QUOTA_EXCEEDED'`) when
 *     the cap is hit.
 *
 * Both branches share the same `QuotaModule` providers (controller + service
 * + interceptor class) — only the global hookup is conditional. This keeps
 * existing test fixtures working without changes.
 */
@Module({
  imports: [PrismaModule],
  controllers: [QuotaController],
  providers: [QuotaService, QuotaEnforcementInterceptor],
  exports: [QuotaService, QuotaEnforcementInterceptor],
})
export class QuotaModule {
  /**
   * Env-gated APP_INTERCEPTOR registration. Returns a bare DynamicModule
   * (no APP_INTERCEPTOR provider) when enforcement is disabled — NestJS
   * simply instantiates `QuotaModule` as if `forRoot()` had not been
   * called.
   */
  static forRoot(): DynamicModule {
    if (process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED !== 'true') {
      return { module: QuotaModule };
    }
    return {
      module: QuotaModule,
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: QuotaEnforcementInterceptor,
        },
      ],
    };
  }
}
