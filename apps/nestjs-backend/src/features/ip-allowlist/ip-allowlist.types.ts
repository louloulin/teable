/**
 * IP allowlist — Stage 25 types.
 *
 * CIDR matching helpers + entry rows.
 */

export type IpAllowlistMode = 'block' | 'audit';

export interface IIpAllowlistEntry {
  id: string;
  organizationId: string;
  cidr: string;
  mode: IpAllowlistMode;
  note: string | null;
}

export interface IIpAllowlistDecision {
  /** True when the source IP matches at least one entry. */
  allowed: boolean;
  /** True when an entry matches AND its mode is 'block' — caller must reject. */
  blocked: boolean;
  /** True when at least one entry matches in 'audit' mode — caller should log. */
  audited: boolean;
  /** ID of the matched entry, when applicable. */
  matchedEntryId: string | null;
}
