/**
 * OAuth — read-only types for the thin-DI auth surface.
 *
 * Authorization codes are issued by the OAuth server at runtime
 * (see `oauth-server.service.ts`) and stored in cache, not Prisma.
 * The thin-DI wrapper persists only the durable authorization row
 * keyed by `clientId + userId`; the `code` parameter here is
 * opaque and serves as a fast-path lookup key into that row.
 */

export interface IAuthorizedClientRef {
  /** Stable OAuth client identifier (the public `client_id`). */
  clientId: string;
  /** User the authorization row belongs to. */
  userId: string;
}

export interface IAuthorizationCodeLookup {
  /**
   * Authorization code from the OAuth flow. Treated as opaque by
   * the wrapper — it's the row's `id`, which is set when the
   * authorization record is first written.
   */
  code: string;
}

export interface IAuthorizedAppRecord {
  id: string;
  clientId: string;
  userId: string;
  authorizedTime: string;
}

export interface IParsedRedirectUri {
  /** Original URI exactly as supplied. */
  raw: string;
  /** Protocol scheme (e.g. 'https'). */
  scheme: string;
  /** Hostname (lower-cased). */
  host: string;
  /** Port, when present. */
  port: number | null;
  /** Path component (no query / fragment). */
  path: string;
  /** True when the URI matches a loopback redirect (RFC 8252). */
  isLoopback: boolean;
}
