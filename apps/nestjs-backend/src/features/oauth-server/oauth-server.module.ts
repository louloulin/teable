import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/**
 * OAuth 2.0 server module — Stage 16.
 *
 * Exposes the four-endpoint RFC 6749 surface (plus userinfo) needed by
 * third-party applications integrating with a self-hosted OSS Teable.
 *
 * Auth on `POST /api/oauth/applications` is delegated to the upstream
 * admin guard (TEABLE_ADMIN_TOKEN or capability-gated). The remaining
 * endpoints are intentionally open at the network layer — security is
 * enforced by client_id+client_secret+PKCE on every code/token call.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthServerModule {}
