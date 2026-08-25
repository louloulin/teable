/**
 * OAuth 2.0 server (Stage 16) — types.
 *
 * Scopes are coarse but enough for an OSS Business-equivalent gap fill.
 * Extension to fine-grained resource scopes is left for a follow-up
 * stage once we know which third-party apps actually integrate.
 */

export const OAUTH_SCOPES = ['read', 'write', 'admin'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const DEFAULT_ACCESS_TOKEN_TTL_SEC = 3600; // 1h
export const DEFAULT_REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30d
export const DEFAULT_AUTHORIZATION_CODE_TTL_SEC = 600; // 10 min

export interface IOAuthApplicationRow {
  id: string;
  clientId: string;
  clientSecretHash: string;
  name: string;
  redirectUris: string[];
  scopes: OAuthScope[];
  createdBy: string;
  createdTime: Date;
}

export interface IAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  responseType: 'code';
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

export interface ITokenRequest {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ITokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
  scope: string;
}

export interface ICreateApplicationInput {
  name: string;
  redirectUris: string[];
  scopes: OAuthScope[];
  createdBy: string;
}

/**
 * Result returned when an application is freshly created. The plaintext
 * client_secret is only available at creation time — server only stores
 * the scrypt hash.
 */
export interface ICreateApplicationResult {
  application: IOAuthApplicationRow;
  clientSecret: string;
}
