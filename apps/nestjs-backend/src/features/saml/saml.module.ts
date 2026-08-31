import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { SsoModule } from '../sso/sso.module';
import { UserModule } from '../user/user.module';
import { SamlAuthService } from './saml.auth.service';
import { SamlController } from './saml.controller';

/**
 * Stage 9 — SAML 2.0 SP module.
 *
 * Mounts the SAML HTTP endpoints and depends on `SsoModule` so we can
 * reuse `SsoAuthService.resolveLocalUser()` to provision / find the
 * local user (same email-verified + domain-match guards the OIDC path
 * uses). Login state rows are stored in the existing `SsoLoginState`
 * table, so the OIDC cleanup processor also drains expired SAML state.
 *
 * Endpoints (all public — the IdP is the source of identity):
 *   GET  /api/auth/saml/login       -> 302 to IdP
 *   POST /api/auth/saml/callback    -> validate assertion, write session
 *   GET  /api/auth/saml/metadata    -> SP metadata XML for IdP admin
 */
@Module({
  imports: [PrismaModule, SsoModule, UserModule],
  controllers: [SamlController],
  providers: [SamlAuthService],
  exports: [SamlAuthService],
})
export class SamlModule {}
