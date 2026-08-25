/**
 * Federated SSO — Stage 60.
 *
 * Unifies Stage 4 (OIDC) and Stage 21 (SAML) into a single
 * `ISsoProvider` record so a base can enable multiple IdPs
 * simultaneously and let the resolver pick one at login time.
 */

export type SsoProtocol = 'oidc' | 'saml';

export interface IOidcProviderConfig {
  /** OIDC issuer URL (e.g. https://accounts.google.com). */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Override the discovery URL when `issuer` doesn't host /.well-known/openid-configuration. */
  discoveryUrl?: string;
  scopes?: string[];
  /** Map of OIDC claims → local user attributes. */
  claimMap?: Record<string, string>;
}

export interface ISamlProviderConfig {
  entityId: string;
  ssoUrl: string;
  /** Base64-encoded X.509 signing certificate. */
  certificate: string;
  /** SAML attribute → local user attribute mapping. */
  attributeMap?: Record<string, string>;
  signRequests?: boolean;
  /** Optional relay state parameter. */
  relayState?: string;
}

export interface ISsoProvider {
  id: string;
  baseId: string;
  name: string;
  protocol: SsoProtocol;
  enabled: boolean;
  /** When true, the first matching user with that email is auto-linked. */
  autoLink?: boolean;
  /** Domains that route to this provider (e.g. ["acme.com"]). */
  emailDomains?: string[];
  /** Priority when multiple providers match; lower = higher priority. */
  priority: number;
  config: IOidcProviderConfig | ISamlProviderConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ISsoDiscoveryRequest {
  baseId: string;
  email: string;
}

export interface ISsoDiscoveryResult {
  provider: ISsoProvider | null;
  reason: 'matched-domain' | 'matched-default' | 'no-match' | 'disabled';
}

export interface IFederatedSession {
  providerId: string;
  protocol: SsoProtocol;
  /** Stable subject identifier from the IdP. */
  subject: string;
  email?: string;
  /** Local user that was created or linked. */
  userId?: string;
  issuedAt: string;
  expiresAt: string;
  /** Captured claim / attribute snapshot. */
  attributes: Record<string, string>;
}
