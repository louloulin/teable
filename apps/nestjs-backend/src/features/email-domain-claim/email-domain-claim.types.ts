/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Email domain claim — Stage 72.
 *
 * Enterprise feature: orgs claim ownership of an email domain (acme.com)
 * by publishing a DNS TXT record with a verification token. Once a domain
 * is claimed, any user signing up with @acme.com is auto-joined to the
 * org (subject to admin approval) and admins can lock the email suffix
 * for their existing users.
 */

export type ClaimStatus = 'pending' | 'verified' | 'failed' | 'revoked';
export type ClaimMode = 'open' | 'review' | 'locked';
export type DnsRecordKind = 'txt';

export interface IEmailDomainClaim {
  id: string;
  orgId: string;
  /// "acme.com" — lowercased, trimmed.
  domain: string;
  /// Verification token, rendered as "teable-verify=<token>" TXT.
  token: string;
  status: ClaimStatus;
  /// Auto-join policy for matching users.
  mode: ClaimMode;
  /// Default role id when mode=open or mode=review.
  defaultRoleId: string | null;
  /// Last DNS check timestamp.
  lastCheckedAt: string | null;
  /// Last verification error if status=failed.
  lastError: string | null;
  /// When status=verified, when the verification happened.
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IClaimAuditEntry {
  id: string;
  orgId: string;
  domain: string;
  /// "create" | "verify" | "revoke" | "auto-join" | "policy-change"
  action: string;
  actorId: string;
  details: string;
  createdAt: string;
}

export interface IAutoJoinCandidate {
  userId: string;
  email: string;
  matchDomain: string;
  claimId: string;
  /// Whether admin review is required.
  requiresReview: boolean;
  /** Suggested role id when accepted. */
  suggestedRoleId: string | null;
}

export interface IEmailDomainClaimOptions {
  /// Override the verification token length.
  tokenLength?: number;
  /// Override DNS resolver.
  resolver?: 'mock' | 'system';
  /// Override "now".
  now?: string;
}

export const DEFAULT_TOKEN_LENGTH = 32;
export const MAX_DOMAINS_PER_ORG = 16;
export const MAX_DNS_CHECK_AGE_MS = 86_400_000;
export const MIN_DOMAIN_LENGTH = 4;
export const MAX_DOMAIN_LENGTH = 253;
export const CLAIM_STATUSES: ReadonlyArray<ClaimStatus> = [
  'pending',
  'verified',
  'failed',
  'revoked',
];
export const CLAIM_MODES: ReadonlyArray<ClaimMode> = ['open', 'review', 'locked'];

export const DOMAIN_VERIFICATION_PREFIX = 'teable-verify=';

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: '待验证',
  verified: '已验证',
  failed: '验证失败',
  revoked: '已撤销',
};

export const CLAIM_MODE_LABELS: Record<ClaimMode, string> = {
  open: '自动加入',
  review: '需要审核',
  locked: '锁定后缀',
};
