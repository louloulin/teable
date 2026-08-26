import { Module } from '@nestjs/common';

import { IpAllowlistAuthService } from './ip-allowlist.auth.service';
import { IpAllowlistController } from './ip-allowlist.controller';
import { IpAllowlistMiddleware } from './ip-allowlist.middleware';
import { IpAllowlistService } from './ip-allowlist.service';

/**
 * IP allowlist module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controller/middleware/service as-is and adds the
 * auth-only surface (`IpAllowlistAuthService`) so callers can evaluate an
 * IP without pulling in the full middleware pipeline.
 */
@Module({
  providers: [IpAllowlistService, IpAllowlistMiddleware, IpAllowlistAuthService],
  controllers: [IpAllowlistController],
  exports: [IpAllowlistService, IpAllowlistMiddleware, IpAllowlistAuthService],
})
export class IpAllowlistModule {}