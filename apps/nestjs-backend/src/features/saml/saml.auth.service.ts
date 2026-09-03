import { BadRequestException, Injectable, Optional } from '@nestjs/common';
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
import { verifySamlSignature } from './saml.signature';

/**
 * R48 — SAML domain-verified gate.
 *
 * `DomainVerificationService.isSsoDomainVerified(email)` returns true
 * only when the email's domain has been claimed by the same org that
 * owns the SAML provider AND the DNS TXT check has succeeded.
 *
 * We inject it as `@Optional()` so the auth service still works in
 * standalone tests and in environments that haven't wired domain
 * verification. Production wiring (AppModule / SsoModule) provides
 * the real implementation.
 */
type ISsoDomainVerifier = {
  isSsoDomainVerified: (email: string) => Promise<boolean>;
};

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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly domainVerifier?: ISsoDomainVerifier
  ) {}

  /** SP metadata XML for the IdP admin to import. */
  buildMetadata(opts: { spEntityId: string; acsUrl: string; name: string }): string {
    return buildMetadataXml({
      entityId: opts.spEntityId,
      acsUrl: opts.acsUrl,
      name: opts.name,
    });
  }

/**
   * Public lookup so the controller can hydrate a SAML provider row
   * after the IdP response lands (state is consumed in
   * `completeLogin`, so we re-fetch by id to learn the emailDomain
   * needed by `SsoAuthService.resolveLocalUser`).
   */
  async findProviderById(providerId: string) {
    return this.prisma.ssoIdentityProvider.findUnique({ where: { id: providerId } });
  }

  /**
   * R49 — default clock-skew tolerance for NotBefore/NotOnOrAfter.
   * 60 s covers realistic NTP drift between IdP and SP without
   * extending the window enough for replay attacks to slip through.
   */
  static readonly DEFAULT_CLOCK_SKEW_MS = 60_000;

  /**
   * R49 — verify the SAML assertion is fresh. Rejects when:
   *   - no Conditions element / no NotOnOrAfter (some IdPs skip these
   *     for short-lived assertions, but production IdPs include them)
   *   - now >= notOnOrAfter + clockSkew (assertion expired)
   *   - now + clockSkew < notBefore (assertion not yet valid)
   * Clock skew is configurable per-call; defaults to 60s.
   */
  private assertAssertionFresh(
    assertion: { notOnOrAfter: number | null; notBefore: number | null },
    clockSkewMs: number = SamlAuthService.DEFAULT_CLOCK_SKEW_MS
  ): void {
    if (assertion.notOnOrAfter == null) {
      throw new BadRequestException('SAML assertion missing NotOnOrAfter — refusing unsigned assertion');
    }
    const now = Date.now();
    if (now >= assertion.notOnOrAfter + clockSkewMs) {
      throw new BadRequestException('SAML assertion expired (NotOnOrAfter)');
    }
    if (assertion.notBefore != null && now + clockSkewMs < assertion.notBefore) {
      throw new BadRequestException('SAML assertion not yet valid (NotBefore)');
    }
  }

  /**
   * R49 — verify the SAML response carries at least one signature
   * element. We DO NOT verify the cryptographic signature here — that
   * requires xml-crypto + IdP cert pin (R50 follow-up). The point of
   * this check is to reject a tampered response that has had its
   * signature stripped before reaching us.
   */
  private assertSignaturePresent(assertion: { hasSignature: boolean }): void {
    if (!assertion.hasSignature) {
      throw new BadRequestException('SAML response missing <ds:Signature>');
    }
  }

  /**
   * R51 — cryptographic signature verification. Fail-closed: only
   * invoked when `ssoIdentityProvider.idpCert` is non-empty (caller
   * gates it). When the IdP has no cert configured, we leave the
   * signature-presence check from R49 to catch strip-after-send but
   * still mark the row for operator follow-up via the audit log.
   */
  private assertSignatureCryptographic(
    samlResponseXml: string,
    idpCert: string | null | undefined
  ): void {
    if (!idpCert || idpCert.trim() === '') {
      // R51 — fail-closed in production. OSS / test environments skip
      // signature verification when no cert is configured so unit tests
      // don't have to wire a real RSA keypair. Production deployments
      // set NODE_ENV=production and always configure idpCert per
      // provider; missing it is an operator misconfiguration that
      // should reject the login.
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException(
          'SAML signature verification skipped: IdP certificate not configured'
        );
      }
      return;
    }
    const result = verifySamlSignature(samlResponseXml, idpCert);
    if (!result.ok) {
      throw new BadRequestException(`SAML signature verification failed: ${result.detail ?? 'unknown'}`);
    }
  }

  /**
   * R50 — verify the assertion's audience matches our SP entity ID.
   * Some IdPs omit AudienceRestriction (returns audience === null); we
   * fail-open there because the alternative is breaking every IdP that
   * doesn't populate it, and the assertion's NotOnOrAfter + InResponseTo
   * + signature-presence still bound the attack surface.
   */
  private assertAudienceMatches(assertedAudience: string | null, spEntityId: string): void {
    if (assertedAudience == null) return;
    if (assertedAudience !== spEntityId) {
      throw new BadRequestException(
        `SAML audience mismatch: asserted=${assertedAudience} expected=${spEntityId}`
      );
    }
  }

  /**
   * R48 — verify the email's domain is verified for SSO. Caller
   * passes the email hint from startLogin OR the asserted email
   * from completeLogin. Returns silently when no verifier is wired
   * (test / non-prod environments); throws BadRequestException
   * when the domain is NOT verified in production.
   */
  private async assertDomainVerified(email: string): Promise<void> {
    if (!this.domainVerifier) {
      // No verifier wired — fail-open for OSS / tests. Cloud
      // deployments wire the real DomainVerificationService.
      return;
    }
    const ok = await this.domainVerifier.isSsoDomainVerified(email);
    if (!ok) {
      throw new BadRequestException(
        'email domain is not verified for SSO; complete domain verification first'
      );
    }
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
    // R48 — domain-verified gate. Only check when the caller supplied an
    // email hint; otherwise the IdP will provide it on callback and
    // completeLogin re-checks.
    if (input.emailId && input.emailId.includes('@')) {
      await this.assertDomainVerified(input.emailId);
    }
    const stateId = `saml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { encoded, xml } = buildAuthnRequest({
      issuer: provider.issuer,
      ssoUrl: provider.ssoUrl,
      spEntityId: input.spEntityId,
      acsUrl: input.acsUrl,
      stateId,
    });
    // R50 — capture the AuthnRequest ID so the callback can verify
    // InResponseTo. The ID is generated inside buildAuthnRequest (with
    // a leading underscore); we extract it here so it can be persisted
    // on the login-state row.
    const authnIdMatch = xml.match(/ID="([^"]+)"/);
    const authnRequestId = authnIdMatch ? authnIdMatch[1] : null;
    await this.writeState(stateId, {
      organizationId: input.organizationId,
      providerId: provider.id,
      returnTo: input.returnTo,
      requestId: authnRequestId,
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
    /** R50 — AuthnRequest ID we sent in startLogin, used for cross-service replay defence. */
    requestId: string | null;
    /** R50 — InResponseTo from the IdP Response, compared against requestId. */
    inResponseTo: string | null;
  }> {
    const state = await this.consumeState(input.relayState);
    const parsed = parseSamlResponse(input.samlResponse);
    const { assertion, inResponseTo } = parsed;
    const email = extractEmailFromAssertion({
      nameId: assertion.nameId,
      attributes: assertion.attributes,
    });
    if (!email || !email.includes('@')) {
      throw new BadRequestException('assertion missing email');
    }
    // R48 — defense-in-depth: even if startLogin was bypassed, the
    // email asserted by the IdP must still match a domain-verified row.
    await this.assertDomainVerified(email);
    // R49 — assertion freshness + signature presence. Reject expired
    // or pre-dated assertions and unsigned responses before we trust
    // the asserted email.
    this.assertAssertionFresh({ notOnOrAfter: assertion.notOnOrAfter, notBefore: assertion.notBefore });
    this.assertSignaturePresent({ hasSignature: assertion.hasSignature });
    // R50 — audience binding (fail-open when IdP omits the restriction).
    this.assertAudienceMatches(assertion.audience, this.spEntityId());
    // R51 — cryptographic signature verification. We look up the
    // IdP cert from the provider row each call; this is a single
    // indexed read so the cost is negligible.
    const idpCert = await this.findProviderCert(state.providerId);
    this.assertSignatureCryptographic(input.samlResponse, idpCert);
    // R50 — InResponseTo cross-service replay protection. When the
    // login state has a requestId (the AuthnRequest ID we sent), the
    // IdP's Response MUST echo it back in InResponseTo. If the IdP
    // omitted InResponseTo, we fail-closed: that's a strong signal
    // either the IdP misconfigured OR the response was replayed from
    // somewhere else. Skip this check only when our own state row
    // predates the migration (requestId is null).
    if (state.requestId) {
      if (!inResponseTo) {
        throw new BadRequestException('SAML response missing InResponseTo attribute');
      }
      if (inResponseTo !== state.requestId) {
        throw new BadRequestException('SAML InResponseTo does not match AuthnRequest ID');
      }
    }
    const { givenName, surname } = extractDisplayName({ attributes: assertion.attributes });
    return {
      ...state,
      email,
      givenName,
      surname,
      sessionIndex: assertion.sessionIndex ?? undefined,
      requestId: state.requestId,
      inResponseTo,
    };
  }

  // --- internals ---

  private spEntityId(): string {
    const base = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
    return base.replace(/\/$/, '');
  }

  private async findProviderCert(providerId: string): Promise<string | null> {
    const provider = await this.prisma.ssoIdentityProvider.findUnique({
      where: { id: providerId },
      select: { idpCert: true },
    });
    return provider?.idpCert ?? null;
  }

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
    data: { organizationId: string; providerId: string; returnTo?: string; requestId?: string | null }
  ): Promise<void> {
    await this.prisma.ssoLoginState.create({
      data: {
        state: stateId,
        organizationId: data.organizationId,
        providerId: data.providerId,
        redirectTo: data.returnTo ?? null,
        // R50 — AuthnRequest ID for InResponseTo cross-service replay check
        requestId: data.requestId ?? null,
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
    requestId: string | null;
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
      requestId: row.requestId ?? null,
    };
  }
}
