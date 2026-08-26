/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * IP allowlist — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the IP-allowlist auth surface. No Nest DI, no Prisma
 * — safe to call from anywhere. Consumed by `IpAllowlistAuthService`.
 */

import type { IAllowlistCheck, IAllowlistEntry } from './ip-allowlist.types';

/** Parse a single CIDR/IP string into its address and prefix length. */
export function parseCidr(raw: string): { address: string; prefix: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf('/');
  if (idx < 0) {
    return { address: trimmed, prefix: 32 };
  }
  const prefix = Number.parseInt(trimmed.slice(idx + 1), 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  return { address: trimmed.slice(0, idx), prefix };
}

/** Convert an IPv4 address string to a 32-bit integer. */
export function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

/** Test whether `ip` is covered by `cidr` (IPv4 only). */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const ipNum = ipToInt(ip);
  const cidrNum = ipToInt(parsed.address);
  if (ipNum === null || cidrNum === null) return false;
  if (parsed.prefix === 0) return true;
  const mask = (~((1 << (32 - parsed.prefix)) - 1)) >>> 0;
  return (ipNum & mask) === (cidrNum & mask);
}

/** Find the first CIDR in `entries` that matches `ip`. */
export function findMatchingCidr(ip: string, entries: readonly IAllowlistEntry[]): string | null {
  for (const entry of entries) {
    if (ipMatchesCidr(ip, entry.cidr)) return entry.cidr;
  }
  return null;
}

/** Evaluate `ip` against the allowlist. */
export function evaluateAllowlist(ip: string, entries: readonly IAllowlistEntry[]): IAllowlistCheck {
  if (entries.length === 0) {
    return { allowed: false, reason: 'allowlist-empty' };
  }
  const matched = findMatchingCidr(ip, entries);
  if (matched) {
    return { allowed: true, matchedCidr: matched, reason: 'in-allowlist' };
  }
  return { allowed: false, reason: 'not-in-allowlist' };
}