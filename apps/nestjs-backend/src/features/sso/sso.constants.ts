import type { SsoProviderType } from '@teable/db-main-prisma';

export const SSO_LOGIN_STATE_TTL_MS = 5 * 60 * 1000;
export const SSO_DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;
export const SSO_JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
export const SSO_LOGIN_PATH = '/api/auth/sso/login';
export const SSO_CALLBACK_PATH = '/api/auth/sso/callback';

// Stage 4.2 — repeat interval for the background job that deletes expired
// SsoLoginState rows. Kept small (1 minute) so the DB never holds PII
// (state, emailHint, redirectTo) for more than ~6 minutes after a login
// attempt completes or expires.
export const SSO_LOGIN_STATE_CLEANUP_QUEUE = 'sso-login-state-cleanup';
export const SSO_LOGIN_STATE_CLEANUP_REPEAT_MS = 60 * 1000;

export interface ISsoDiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
}

export interface ISsoIdTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [k: string]: unknown;
}

export interface ISsoProviderConfig {
  id: string;
  organizationId: string;
  type: SsoProviderType;
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string | null;
  emailDomain: string;
}
