import { Injectable } from '@nestjs/common';

import { SSO_CALLBACK_PATH } from './sso.constants';

/**
 * SAML ↔ OIDC federation helpers for the SSO module.
 *
 * Federation here means: expose both protocols' service-provider-side
 * metadata so an external IdP (or a peer app in the same trust domain)
 * can discover our endpoints and our attribute contract. The two docs
 * are generated from a single public origin so they stay consistent.
 *
 * Keep this service pure — no DB, no network — so the document shape
 * is unit-testable in isolation. The controller layer is responsible
 * for picking the orgId / tenant context and feeding it in.
 */
@Injectable()
export class SsoFederationService {
  /**
   * Build the SAML 2.0 SP metadata document. Standard shape per
   * `saml-metadata-2.0-os` §2 — an IdP that imports this knows our
   * entityID, ACS, NameID format, and the attributes we'll request.
   *
   * `entityId` defaults to `<publicOrigin>/api/auth/sso/saml` so the
   * document is stable across deploys without operator config.
   */
  buildSamlMetadata(input: {
    publicOrigin: string;
    entityId?: string;
    signRequests?: boolean;
  }): string {
    const base = this.normalizeOrigin(input.publicOrigin);
    const entityId = input.entityId ?? `${base}/api/auth/sso/saml`;
    const acsUrl = `${base}${SSO_CALLBACK_PATH}`;
    const sloUrl = `${base}/api/auth/sso/slo`;

    const wantAssertionsSigned = input.signRequests ? 'true' : 'false';

    return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${this.escapeXmlAttr(entityId)}">
  <SPSSODescriptor AuthnRequestsSigned="false"
                   WantAssertionsSigned="${wantAssertionsSigned}"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${this.escapeXmlAttr(acsUrl)}"
                              index="0"
                              isDefault="true" />
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                         Location="${this.escapeXmlAttr(sloUrl)}" />
    <AttributeConsumingService index="0">
      <ServiceName xml:lang="en">Teable</ServiceName>
      <ServiceDescription xml:lang="en">Teable SSO attribute contract</ServiceDescription>
      <RequestedAttribute NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
                          FriendlyName="email"
                          Name="urn:oid:0.9.2342.19200300.100.1.3"
                          isRequired="true" />
      <RequestedAttribute NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
                          FriendlyName="groups"
                          Name="urn:oid:1.3.6.1.4.1.5923.1.5.1.1" />
      <RequestedAttribute NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
                          FriendlyName="displayName"
                          Name="urn:oid:2.16.840.1.113730.3.1.241" />
    </AttributeConsumingService>
  </SPSSODescriptor>
</EntityDescriptor>
`;
  }

  /**
   * Build the OIDC discovery document for the SP side. This is what
   * well-known tooling (e.g. aws sso sync, terraform-provider-okta)
   * crawls to wire teable as a relying party.
   *
   * Mirrors `ISsoDiscoveryDoc` on the IdP side so the same client code
   * that consumes IdP discovery can consume SP discovery verbatim.
   */
  // OIDC discovery property names are fixed by OIDC core 1.0 §4 and must
  // match the wire format verbatim, so snake_case is non-negotiable.
  /* eslint-disable @typescript-eslint/naming-convention */
  buildOidcDiscovery(input: { publicOrigin: string }): {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    userinfo_endpoint: string;
    end_session_endpoint: string;
    response_types_supported: string[];
    subject_types_supported: string[];
    id_token_signing_alg_values_supported: string[];
    scopes_supported: string[];
    claims_supported: string[];
  } {
    /* eslint-enable @typescript-eslint/naming-convention */
    const base = this.normalizeOrigin(input.publicOrigin);
    const issuer = `${base}/api/auth/sso/oidc`;
    return {
      issuer,
      authorization_endpoint: `${base}/api/auth/sso/oidc/authorize`,
      token_endpoint: `${base}/api/auth/sso/oidc/token`,
      jwks_uri: `${base}/api/auth/sso/oidc/jwks`,
      userinfo_endpoint: `${base}/api/auth/sso/oidc/userinfo`,
      end_session_endpoint: `${base}/api/auth/sso/oidc/logout`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile', 'groups'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'email',
        'email_verified',
        'name',
        'picture',
        'groups',
      ],
    };
  }

  /**
   * Harmonize raw attribute assertions from either protocol into a
   * single `IUnifiedUserClaims` shape. Both SAML and OIDC flows funnel
   * through here so downstream consumers (e.g. SsoAuthService) never
   * have to know which protocol the IdP used.
   */
  harmonizeAttributes(input: {
    saml?: ISamlAttributePayload;
    oidc?: IOidcAttributePayload;
  }): IUnifiedUserClaims {
    const samlEmail =
      input.saml?.nameId ??
      input.saml?.attributes?.['email']?.[0] ??
      input.saml?.attributes?.['mail']?.[0] ??
      input.saml?.attributes?.['urn:oid:0.9.2342.19200300.100.1.3']?.[0];
    const samlGroups =
      input.saml?.attributes?.['groups'] ??
      input.saml?.attributes?.['memberOf'] ??
      input.saml?.attributes?.['urn:oid:1.3.6.1.4.1.5923.1.5.1.1'] ??
      [];
    const samlName =
      input.saml?.attributes?.['displayName']?.[0] ?? input.saml?.attributes?.['name']?.[0];

    const oidcEmail = input.oidc?.email;
    const oidcGroups = input.oidc?.groups ?? [];

    const email = (oidcEmail ?? samlEmail)?.toString().trim().toLowerCase() || undefined;
    const groups = this.mergeStringList(oidcGroups, samlGroups);
    const name = input.oidc?.name ?? samlName;

    return {
      email,
      name: name?.toString() || undefined,
      groups,
      source: input.oidc && input.saml ? 'federated' : input.oidc ? 'oidc' : 'saml',
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Merge two possibly-stringly-typed group lists into a deduped array.
   * OIDC `groups` is usually `string[]`; SAML groups are commonly a
   * semicolon- or pipe-delimited scalar — handle both shapes.
   */
  private mergeStringList(
    a: ReadonlyArray<string | undefined> | undefined,
    b: ReadonlyArray<string> | undefined
  ): string[] {
    const out = new Set<string>();
    for (const raw of [...(a ?? []), ...(b ?? [])]) {
      if (typeof raw !== 'string' || !raw) continue;
      for (const piece of raw.split(/[;|]/)) {
        const trimmed = piece.trim();
        if (trimmed) out.add(trimmed);
      }
    }
    return Array.from(out);
  }

  private normalizeOrigin(input: string): string {
    return input.replace(/\/$/, '');
  }

  private escapeXmlAttr(input: string): string {
    return input.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&apos;';
      }
    });
  }
}

// ─── input shapes ──────────────────────────────────────────────────────────

export interface ISamlAttributePayload {
  /** SAML 2.0 NameID value (e.g. `jane.doe@acme.com`). */
  nameId?: string;
  /** SAML AttributeStatement values keyed by attribute Name or FriendlyName. */
  attributes?: Record<string, string[] | undefined>;
}

export interface IOidcAttributePayload {
  email?: string;
  // `email_verified` is the OIDC core claim name; snake_case is required
  // by RFC and by every IdP we federate against.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  email_verified?: boolean;
  name?: string;
  picture?: string;
  groups?: string[];
  [k: string]: unknown;
}

export interface IUnifiedUserClaims {
  email?: string;
  name?: string;
  groups: string[];
  source: 'saml' | 'oidc' | 'federated';
}
