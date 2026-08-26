/**
 * Access-token — thin-DI wrapper (Stage N).
 *
 * Pure helpers for formatting / parsing access-token identifiers used by the
 * auth surface. No Nest DI, no Prisma — safe to call from anywhere.
 */

import type { IAccessTokenRecord } from './access-token.types';

/** Format the wire representation of an access token id (just the id, no prefix). */
export function formatAccessTokenId(tokenId: string): string {
  return tokenId.trim();
}

/** Parse the user-facing prefix from an access token id; returns null when empty. */
export function parseAccessTokenPrefix(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf('_');
  return idx > 0 ? trimmed.slice(0, idx) : null;
}

/** True when `expiredTime` is in the past (1ms tolerance). */
export function isAccessTokenExpired(record: Pick<IAccessTokenRecord, 'expiredTime'>): boolean {
  if (!record.expiredTime) return false;
  return new Date(record.expiredTime).getTime() < Date.now() + 1000;
}
