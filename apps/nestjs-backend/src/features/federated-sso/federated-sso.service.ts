/**
 * Federated SSO — pure helpers (Stage 60).
 */

import type {
  IFederatedSession,
  IOidcProviderConfig,
  ISamlProviderConfig,
  ISsoDiscoveryRequest,
  ISsoDiscoveryResult,
  ISsoProvider,
} from './federated-sso.types';

export const DEFAULT_SSO_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h
export const OIDC_DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const;

/** Sort providers by priority then name (stable). */
export function sortProviders(providers: ReadonlyArray<ISsoProvider>): ISsoProvider[] {
  return [...providers].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

/** Extract the domain part of an email address (lowercase, no leading @). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

/**
 * Pick the provider that should handle this login request. The match is
 * `email-domain` first, then the lowest-priority enabled provider.
 */
export function discoverProvider(
  req: ISsoDiscoveryRequest,
  providers: ReadonlyArray<ISsoProvider>
): ISsoDiscoveryResult {
  const candidates = providers.filter((p) => p.baseId === req.baseId);
  if (candidates.length === 0) return { provider: null, reason: 'no-match' };
  const enabled = sortProviders(candidates).filter((p) => p.enabled);
  if (enabled.length === 0) return { provider: null, reason: 'disabled' };
  const domain = emailDomain(req.email);
  const matched = enabled.find(
    (p) => p.emailDomains && p.emailDomains.map((d) => d.toLowerCase()).includes(domain)
  );
  if (matched) return { provider: matched, reason: 'matched-domain' };
  return { provider: enabled[0] ?? null, reason: 'matched-default' };
}

/** Validate an OIDC config — catches the common mistakes early. */
export function validateOidcConfig(cfg: IOidcProviderConfig): string[] {
  const errs: string[] = [];
  if (!cfg.issuer) errs.push('issuer is required');
  if (!cfg.clientId) errs.push('clientId is required');
  if (!cfg.clientSecret) errs.push('clientSecret is required');
  if (cfg.issuer && !/^https?:\/\//.test(cfg.issuer)) errs.push('issuer must be http(s)');
  return errs;
}

/** Validate a SAML config. */
export function validateSamlConfig(cfg: ISamlProviderConfig): string[] {
  const errs: string[] = [];
  if (!cfg.entityId) errs.push('entityId is required');
  if (!cfg.ssoUrl) errs.push('ssoUrl is required');
  if (!cfg.certificate) errs.push('certificate is required');
  if (cfg.certificate && cfg.certificate.length < 100) {
    errs.push('certificate looks too short (expect base64-encoded X.509)');
  }
  return errs;
}

/** Validate a full provider record. */
export function validateProvider(p: ISsoProvider): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push('id is required');
  if (!p.baseId) errs.push('baseId is required');
  if (!p.name) errs.push('name is required');
  if (p.priority < 0) errs.push('priority must be >= 0');
  if (p.protocol === 'oidc') errs.push(...validateOidcConfig(p.config as IOidcProviderConfig));
  if (p.protocol === 'saml') errs.push(...validateSamlConfig(p.config as ISamlProviderConfig));
  return errs;
}

/** Build a federated session descriptor for the caller. */
export function buildSession(args: {
  provider: ISsoProvider;
  subject: string;
  email?: string;
  userId?: string;
  attributes: Record<string, string>;
  now?: Date;
  ttlSeconds?: number;
}): IFederatedSession {
  const now = args.now ?? new Date();
  const ttl = args.ttlSeconds ?? DEFAULT_SSO_SESSION_TTL_SECONDS;
  const expires = new Date(now.getTime() + ttl * 1000);
  return {
    providerId: args.provider.id,
    protocol: args.provider.protocol,
    subject: args.subject,
    email: args.email,
    userId: args.userId,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    attributes: args.attributes,
  };
}

/** Convenience to derive the OIDC redirect URI. */
export function oidcAuthorizeUrl(
  cfg: IOidcProviderConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
    scope: (cfg.scopes ?? OIDC_DEFAULT_SCOPES).join(' '),
  });
  return `${cfg.issuer.replace(/\/$/, '')}/authorize?${params.toString()}`;
}

/** Convenience to derive a SAML AuthnRequest URL. */
export function samlLoginUrl(cfg: ISamlProviderConfig, redirectUri: string): string {
  const params = new URLSearchParams({
    SAMLRequest: 'placeholder',
    RelayState: cfg.relayState ?? redirectUri,
  });
  return `${cfg.ssoUrl}?${params.toString()}`;
}
