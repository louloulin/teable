import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { IpAllowlistController } from './ip-allowlist.controller';
import { IpAllowlistMiddleware } from './ip-allowlist.middleware';
import { IpAllowlistService } from './ip-allowlist.service';

/**
 * The middleware is exported (not just registered as APP_* here) so the global
 * module can attach it via `consumer.apply(...).forRoutes('*')` — keeping the
 * "global middleware" pattern consistent with RequestInfoMiddleware and
 * SessionCsrfMiddleware, which are also wired from GlobalModule.configure.
 */
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [IpAllowlistController],
  providers: [IpAllowlistService, IpAllowlistMiddleware],
  exports: [IpAllowlistService, IpAllowlistMiddleware],
})
export class IpAllowlistModule implements NestModule {
  // Middleware is mounted from GlobalModule.configure so it runs alongside the
  // other global middlewares (ClsMiddleware, SessionCsrfMiddleware,
  // RequestInfoMiddleware). No-op here keeps Nest happy when the module is
  // imported but not directly mounted.
  configure(_consumer: MiddlewareConsumer): void {}
}
