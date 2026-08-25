/**
 * SAML 2.0 service (Stage 21) — types.
 *
 * A minimal, dependency-free SAML SP that talks to an IdP over
 * HTTP-Redirect (AuthnRequest) and HTTP-POST (Response / Assertion).
 * We do NOT implement signature verification on the inbound SAML
 * Response — operators are expected to terminate the SAML connection
 * behind a verified TLS endpoint and pin the IdP certificate via
 * `idpCert` for transport trust. XML parsing + assertion extraction
 * live in `saml.service.ts`.
 */

export interface ISamlProviderRow {
  id: string;
  organizationId: string;
  name: string;
  /** Issuer / entityID of the IdP. */
  issuer: string;
  /** Single Sign-On URL (where we send AuthnRequest). */
  ssoUrl: string;
  /**
   * PEM-encoded X.509 certificate of the IdP. Used to verify the
   * signature on the SAML Response. Optional only when the operator
   * certifies end-to-end TLS is the trust anchor.
   */
  idpCert: string | null;
  /** Email domain this IdP owns (must match a verified OrganizationDomain). */
  emailDomain: string;
  /** Friendly display name shown to users on the login page. */
  displayName: string | null;
  /** True once DNS + cert are validated and the IdP is ready to serve logins. */
  enabled: boolean;
}

export interface ISamlLoginInput {
  emailId: string; // teable user email that started the login (optional)
  organizationId: string;
  returnTo?: string;
}

export interface ISamlLoginResult {
  redirectUrl: string;
  /** Opaque state token written to the SsoLoginState table for CSRF + replay protection. */
  stateId: string;
}

export interface ISamlAssertion {
  /** SAML NameID (typically the user's email). */
  nameId: string;
  /** Map of attribute name → raw value. */
  attributes: Record<string, string | undefined>;
  /** `email` (preferred) falls back to NameID. */
  email: string;
  /** First/Last name, when the IdP provides them. */
  givenName?: string;
  surname?: string;
  /** IdP-issued session expiration (epoch ms). */
  sessionIndex?: string;
  notOnOrAfter?: number;
}

export interface ISamlMetadata {
  entityId: string;
  acsUrl: string;
  /** Friendly provider name baked into the SP descriptor. */
  name: string;
}
