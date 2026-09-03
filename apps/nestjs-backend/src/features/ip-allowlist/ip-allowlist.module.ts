import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { IpAllowlistAuthService } from './ip-allowlist.auth.service';
import { IpAllowlistMiddleware } from './ip-allowlist.middleware';

/**
 * IP allowlist module (Stage 25 + Stage 26).
 *
 * - `IpAllowlistAuthService` exposes CRUD + `evaluate()`.
 * - `IpAllowlistMiddleware` runs on every non-bypass request and enforces
 *   the org's allowlist. Operators that haven't configured any entries
 *   remain fail-open via `IpAllowlistAuthService.evaluate` no-op path.
 *
 * Apply pattern mirrors `auth/session/session.module.ts` — register
 * a middleware consumer on `*` so the middleware fires ahead of
 * controller-bound guards.
 */
@Module({
  imports: [PrismaModule],
  providers: [IpAllowlistAuthService, IpAllowlistMiddleware],
  exports: [IpAllowlistAuthService],
})
export class IpAllowlistModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IpAllowlistMiddleware).forRoutes('*');
  }
}
