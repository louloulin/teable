/**
 * Access-token — thin-DI wrapper (Stage N).
 *
 * Minimal types for the access-token auth surface. The full token lifecycle
 * (create/refresh/update/delete/list) lives in `access-token.service.ts`;
 * this module only declares the shapes needed by `AccessTokenAuthService.validate`.
 */

export interface IAccessTokenRecord {
  id: string;
  userId: string;
  /** Encrypted sign blob (used by sign() to recompute and compare). */
  sign: string;
  expiredTime: Date | null;
  lastUsedTime: Date | null;
}

export interface IValidatedAccessToken {
  userId: string;
  accessTokenId: string;
  expiredTime?: string | null;
}

export interface IAccessTokenValidationFailure {
  reason: 'token-not-found' | 'token-expired';
}
