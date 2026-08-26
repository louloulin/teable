/**
 * OAuth — pure helper functions.
 *
 * No DI, no I/O. The two helpers here keep the auth wrapper focused
 * on Prisma access while delegating scope formatting and URI parsing
 * to testable pure functions.
 */

import type { IParsedRedirectUri } from './oauth.types';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Format a raw scope string (`"a b c"` or `"a,b,c"`) into a normalised
 * canonical list. Whitespace is collapsed, duplicates removed, and
 * entries are returned in stable order.
 */
export function formatScope(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[\s,]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  // Preserve first-seen order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Parse a redirect URI into its structural parts. Loopback URIs
 * (`http://localhost:...`, `http://127.0.0.1:...`) are flagged via
 * `isLoopback` to support PKCE flow detection.
 */
export function parseRedirectUri(raw: string): IParsedRedirectUri | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!parsed.protocol || !parsed.hostname) return null;
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host);
  return {
    raw,
    scheme,
    host,
    port: parsed.port ? Number(parsed.port) : null,
    path: parsed.pathname || '/',
    isLoopback,
  };
}
