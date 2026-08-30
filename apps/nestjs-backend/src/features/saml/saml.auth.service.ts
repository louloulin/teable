import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildAuthnRequest,
  buildMetadataXml,
  buildRedirectUrl,
  extractDisplayName,
  extractEmailFromAssertion,
  hashAuthnRequest,
  parseSamlResponse,
} from './saml.service';

/**
 * SAML login orchestrator. The HTTP layer (saml.controller.ts) hands
 * the raw SAMLResponse + RelayState here; we read the state row
 * written by `startLogin`, parse the assertion, and return the
 * resolved email + display name for the auth service to provision
 * the local user.
 *
 * State rows are stored in the existing `SsoLoginState` table, so the
 * OIDC cleanup processor in `SsoModule` covers both flows.
 */
@Injectable()
export class SamlAuthService {
  static readonly STATE_TTL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /** SP metadata XML for the IdP admin to import. */
  buildMetadata(opts: { spEntityId: string; acsUrl: string; name: string }): string {
    return buildMetadataXml({
      entityId: opts.spEntityId,
      acsUrl: opts.acsUrl,
      name: opts.name,
    });
  }

  /**
   * Begin a SAML login for an organization. Returns the URL to
   * redirect the browser to plus the opaque state token the IdP
   * will echo back. Writes a `SsoLoginState` row keyed on `stateId`.
   */
  async startLogin(input: {
    organizationId: string;
    emailId?: string;
    returnTo?: string;
    spEntityId: string;
    acsUrl: string;
  }): Promise<{ redirectUrl: string; stateId: string; authnHash: string }> {
    const provider = await this.findProvider(input.organizationId, input.emailId);
    if (!provider) {
      throw new BadRequestException('no SAML provider for this domain');
    }
    if (provider.status !== 'active' || provider.type !== 'saml') {
      throw new BadRequestException('SAML provider disabled');
    }
    if (!provider.ssoUrl) {
      throw new BadRequestException('SAML provider is missing its SSO URL');
    }
    const stateId = `saml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { encoded, xml } = buildAuthnRequest({
      issuer: provider.issuer,
      ssoUrl: provider.ssoUrl,
      spEntityId: input.spEntityId,
      acsUrl: input.acsUrl,
      stateId,
    });
    await this.writeState(stateId, {
      organizationId: input.organizationId,
      providerId: provider.id,
      returnTo: input.returnTo,
    });
    return {
      redirectUrl: buildRedirectUrl(provider.ssoUrl, encoded, stateId),
      stateId,
      authnHash: hashAuthnRequest(xml),
    };
  }

  /**
   * Validate the SAMLResponse and return the asserted identity.
   * Throws if state is missing/expired or the assertion is malformed.
   */
  async completeLogin(input: { samlResponse: string; relayState: string }): Promise<{
    stateId: string;
    organizationId: string;
    providerId: string;
    returnTo: string | null;
    email: string;
    givenName?: string;
    surname?: string;
    sessionIndex?: string;
  }> {
    const state = await this.consumeState(input.relayState);
    const { assertion } = parseSamlResponse(input.samlResponse);
    const email = extractEmailFromAssertion({
      nameId: assertion.nameId,
      attributes: assertion.attributes,
    });
    if (!email || !email.includes('@')) {
      throw new BadRequestException('assertion missing email');
    }
    const { givenName, surname } = extractDisplayName({ attributes: assertion.attributes });
    return {
      ...state,
      email,
      givenName,
      surname,
      sessionIndex: assertion.sessionIndex ?? undefined,
    };
  }

  // --- internals ---

  private async findProvider(organizationId: string, emailId?: string) {
    if (emailId && emailId.includes('@')) {
      const domain = emailId.split('@')[1]?.toLowerCase();
      if (domain) {
        return this.prisma.ssoIdentityProvider.findFirst({
          where: { organizationId, emailDomain: domain, type: 'saml', status: 'active' },
        });
      }
    }
    return this.prisma.ssoIdentityProvider.findFirst({
      where: { organizationId, type: 'saml', status: 'active' },
    });
  }

  private async writeState(
    stateId: string,
    data: { organizationId: string; providerId: string; returnTo?: string }
  ): Promise<void> {
    await this.prisma.ssoLoginState.create({
      data: {
        state: stateId,
        organizationId: data.organizationId,
        providerId: data.providerId,
        redirectTo: data.returnTo ?? null,
        consumed: false,
        expiresAt: new Date(Date.now() + SamlAuthService.STATE_TTL_MS),
      },
    });
  }

  private async consumeState(stateId: string): Promise<{
    stateId: string;
    organizationId: string;
    providerId: string;
    returnTo: string | null;
  }> {
    const row = await this.prisma.ssoLoginState.findUnique({ where: { state: stateId } });
    if (!row) throw new BadRequestException('invalid state');
    if (row.consumed) throw new BadRequestException('state already consumed');
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('state expired');
    }
    await this.prisma.ssoLoginState.update({
      where: { state: stateId },
      data: { consumed: true },
    });
    return {
      stateId,
      organizationId: row.organizationId,
      providerId: row.providerId,
      returnTo: row.redirectTo ?? null,
    };
  }
}
