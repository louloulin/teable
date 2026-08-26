import { Controller, Get, Header } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { SsoFederationService } from './sso-federation.service';

/**
 * Public federation endpoints. The whole point of these documents is
 * to be downloadable by an IdP without credentials, so every route is
 * marked `@Public()` — they must not sit behind the `sso` capability
 * guard or the admin guard.
 *
 * Both URLs are stable and unauthenticated so the IdP can poll them
 * on its own schedule. No PII, no tenant data — only the SP-side
 * metadata that the IdP needs to wire us up.
 */
@Controller('api/auth/sso/federation')
export class SsoFederationController {
  constructor(private readonly federation: SsoFederationService) {}

  /**
   * SAML 2.0 SP metadata. XML because every SAML IdP in the wild
   * expects XML here — there is no JSON equivalent that ADFS, Okta,
   * OneLogin, and Shibboleth all agree on.
   */
  @Public()
  @Get('saml-metadata.xml')
  @Header('Content-Type', 'application/samlmetadata+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  samlMetadata(): string {
    return this.federation.buildSamlMetadata({ publicOrigin: this.publicOrigin() });
  }

  /**
   * OIDC discovery document for the SP side. JSON because OIDC §4
   * mandates a JSON resource at `/.well-known/openid-configuration`,
   * and tooling has come to expect that shape even when it's not
   * strictly on the well-known path.
   */
  @Public()
  @Get('oidc-discovery.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  oidcDiscovery() {
    return this.federation.buildOidcDiscovery({ publicOrigin: this.publicOrigin() });
  }

  private publicOrigin(): string {
    return process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
  }
}
