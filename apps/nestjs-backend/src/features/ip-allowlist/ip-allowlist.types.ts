/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * IP allowlist — thin-DI wrapper (Stage N).
 *
 * Minimal types for the IP-allowlist auth surface. The full middleware
 * flow stays in `ip-allowlist.middleware.ts`; this module only declares
 * the shapes needed by `IpAllowlistAuthService`.
 */

export interface IAllowlistEntry {
  /** CIDR (e.g. "10.0.0.0/8") or single IP. */
  cidr: string;
  /** Optional human-readable note. */
  note?: string;
}

export interface IAllowlistCheck {
  allowed: boolean;
  matchedCidr?: string;
  reason: 'in-allowlist' | 'not-in-allowlist' | 'allowlist-empty';
}