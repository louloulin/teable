import type { SsoProviderType } from '@teable/db-main-prisma';

export const SSO_LOGIN_STATE_TTL_MS = 5 * 60 * 1000;
export const SSO_DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;
export const SSO_JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
export const SSO_LOGIN_PATH = '/api/auth/sso/login';
export const SSO_CALLBACK_PATH = '/api/auth/sso/callback';

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
