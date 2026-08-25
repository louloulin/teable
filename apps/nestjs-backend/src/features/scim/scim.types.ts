/**
 * SCIM 2.0 types — Stage 23.
 *
 * RFC 7643 (Core Schema) + RFC 7644 (Protocol) — we implement the
 * subset enterprise IdPs (Okta, Azure AD, Google Workspace) actually
 * call. Each resource exposes a stable `id` + `externalId` so the
 * IdP can keep its directory in sync with our user table.
 */

export interface IScimTokenRow {
  id: string;
  organizationId: string;
  label: string;
  tokenHash: string;
  tokenPrefix: string | null;
  enabled: boolean;
  expiresAt: Date | null;
}

/** Minimal SCIM User — what we read and what we write. */
export interface IScimUser {
  /** Local user id. Stable across updates. */
  id: string;
  /** IdP directory id. We store it on `User.externalId`. */
  externalId: string | null;
  userName: string; // login / email
  name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: Array<{ value: string; primary?: boolean; type?: 'work' | 'home' | 'other' }>;
  active: boolean;
  /** Roles assigned to the user (admin / member / guest). */
  roles?: Array<{ value: string; display?: string; primary?: boolean }>;
}

/** Minimal SCIM Group — a flat membership list. */
export interface IScimGroup {
  id: string;
  externalId: string | null;
  displayName: string;
  members: Array<{ value: string; display?: string }>;
}

/** A SCIM ListResponse envelope (`/Users?filter=...`). */
export interface IScimListResponse<T> {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  itemsPerPage: number;
  startIndex: number;
  Resources: T[];
}

/** Bearer-token verification result; null = no match. */
export interface IScimAuthContext {
  tokenId: string;
  organizationId: string;
}
