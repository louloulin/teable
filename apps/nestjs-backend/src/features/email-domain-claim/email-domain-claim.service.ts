/**
 * Email domain claim — pure helpers (Stage 72).
 */

import type {
  ClaimMode,
  ClaimStatus,
  IAutoJoinCandidate,
  IClaimAuditEntry,
  IEmailDomainClaim,
  IEmailDomainClaimOptions,
} from './email-domain-claim.types';
import {
  CLAIM_MODES,
  CLAIM_STATUSES,
  DEFAULT_TOKEN_LENGTH,
  DOMAIN_VERIFICATION_PREFIX,
  MAX_DOMAIN_LENGTH,
  MAX_DOMAINS_PER_ORG,
  MIN_DOMAIN_LENGTH,
} from './email-domain-claim.types';

/** Whether the input is a recognized claim status. */
export function isClaimStatus(s: string): s is ClaimStatus {
  return (CLAIM_STATUSES as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized claim mode. */
export function isClaimMode(s: string): s is ClaimMode {
  return (CLAIM_MODES as ReadonlyArray<string>).includes(s);
}

/** Default token length. */
export function defaultTokenLength(opts?: IEmailDomainClaimOptions): number {
  return opts?.tokenLength ?? DEFAULT_TOKEN_LENGTH;
}

/** Compute max domains per org. */
export function maxDomainsPerOrg(): number {
  return MAX_DOMAINS_PER_ORG;
}

/** Normalize a domain: lowercase + trim. */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase();
}

/** Validate a domain string. */
export function validateDomain(domain: string): string | null {
  const d = normalizeDomain(domain);
  if (d.length < MIN_DOMAIN_LENGTH || d.length > MAX_DOMAIN_LENGTH) {
    return `domain length must be ${MIN_DOMAIN_LENGTH}..${MAX_DOMAIN_LENGTH}`;
  }
  if (!/^[a-z0-9.-]+$/.test(d)) return 'domain contains invalid characters';
  if (!d.includes('.')) return 'domain must contain a dot';
  if (d.startsWith('.') || d.endsWith('.')) return 'domain cannot start/end with dot';
  if (d.includes('..')) return 'domain cannot contain consecutive dots';
  return null;
}

/** Generate a verification token (URL-safe base64 of random bytes). */
export function generateToken(length?: number): string {
  const len = length ?? DEFAULT_TOKEN_LENGTH;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Render the DNS TXT record an admin must publish. */
export function renderVerificationRecord(claim: Pick<IEmailDomainClaim, 'domain' | 'token'>): {
  host: string;
  type: 'TXT';
  value: string;
} {
  return {
    host: `_teable-verify.${claim.domain}`,
    type: 'TXT',
    value: `${DOMAIN_VERIFICATION_PREFIX}${claim.token}`,
  };
}

/** Parse a DNS TXT value into the embedded token (or null). */
export function parseVerificationValue(value: string): string | null {
  if (!value.startsWith(DOMAIN_VERIFICATION_PREFIX)) return null;
  return value.slice(DOMAIN_VERIFICATION_PREFIX.length);
}

/** Validate a claim record. */
export function validateClaim(claim: IEmailDomainClaim): string | null {
  if (!claim.id) return 'id required';
  if (!claim.orgId) return 'orgId required';
  const err = validateDomain(claim.domain);
  if (err) return err;
  if (!claim.token) return 'token required';
  if (!isClaimStatus(claim.status)) return `unknown status: ${claim.status}`;
  if (!isClaimMode(claim.mode)) return `unknown mode: ${claim.mode}`;
  if (claim.status === 'verified' && !claim.verifiedAt) return 'verifiedAt required when verified';
  return null;
}

/** Normalize a claim — fill defaults, lowercase domain. */
export function normalizeClaim(input: {
  id: string;
  orgId: string;
  domain: string;
  token?: string;
  status?: ClaimStatus;
  mode?: ClaimMode;
  defaultRoleId?: string | null;
  now?: string;
}): IEmailDomainClaim {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    orgId: input.orgId,
    domain: normalizeDomain(input.domain),
    token: input.token ?? generateToken(),
    status: input.status ?? 'pending',
    mode: input.mode ?? 'review',
    defaultRoleId: input.defaultRoleId ?? null,
    lastCheckedAt: null,
    lastError: null,
    verifiedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Apply a DNS check result to the claim. */
export function applyDnsCheck(input: {
  claim: IEmailDomainClaim;
  observedValue: string | null;
  now?: string;
}): IEmailDomainClaim {
  const nowIso = input.now ?? new Date().toISOString();
  if (input.observedValue === null) {
    return {
      ...input.claim,
      status: 'failed',
      lastCheckedAt: nowIso,
      lastError: 'no TXT record found',
      updatedAt: nowIso,
    };
  }
  const observedToken = parseVerificationValue(input.observedValue);
  if (observedToken !== input.claim.token) {
    return {
      ...input.claim,
      status: 'failed',
      lastCheckedAt: nowIso,
      lastError: 'token mismatch',
      updatedAt: nowIso,
    };
  }
  return {
    ...input.claim,
    status: 'verified',
    lastCheckedAt: nowIso,
    lastError: null,
    verifiedAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Decide whether a user is a candidate for auto-join. */
export function matchCandidate(input: {
  claim: IEmailDomainClaim;
  email: string;
}): IAutoJoinCandidate | null {
  if (input.claim.status !== 'verified') return null;
  const email = input.email.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1);
  if (domain !== input.claim.domain) return null;
  return {
    userId: '',
    email,
    matchDomain: domain,
    claimId: input.claim.id,
    requiresReview: input.claim.mode !== 'open',
    suggestedRoleId: input.claim.defaultRoleId,
  };
}

/** Decide if a candidate should be auto-joined (vs queued for review). */
export function shouldAutoJoin(input: {
  claim: IEmailDomainClaim;
  candidate: IAutoJoinCandidate;
}): boolean {
  if (input.claim.status !== 'verified') return false;
  if (input.claim.mode === 'locked') return false;
  if (input.candidate.requiresReview) return false;
  return true;
}

/** Compose a claim audit entry. */
export function makeAuditEntry(input: {
  orgId: string;
  domain: string;
  action: string;
  actorId: string;
  details?: string;
  now?: string;
}): IClaimAuditEntry {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    id: `audit-${input.orgId}-${nowIso}-${Math.floor(Math.random() * 1e6)}`,
    orgId: input.orgId,
    domain: normalizeDomain(input.domain),
    action: input.action,
    actorId: input.actorId,
    details: input.details ?? '',
    createdAt: nowIso,
  };
}

/** Count verified claims per org. */
export function countVerified(claims: IEmailDomainClaim[]): number {
  return claims.filter((c) => c.status === 'verified').length;
}

/** Validate org-domain quota. */
export function canClaimMore(currentCount: number): boolean {
  return currentCount < MAX_DOMAINS_PER_ORG;
}
