/**
 * Compliance Attestation — types (Stage 125).
 *
 * Sub-process self-attestations + periodic re-attestation with verification.
 */

export type AttestationKind = 'sub_process' | 'control' | 'period' | 'external';
export type AttestationState = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';

export interface Attestation {
  /** Unique attestation id. */
  id: string;
  /** Kind. */
  kind: AttestationKind;
  /** Reference id (sub-process id, control id, etc). */
  refId: string;
  /** ISO timestamp when submitted. */
  submittedAt: string;
  /** ISO timestamp when expires. */
  expiresAt: string;
  /** Current state. */
  state: AttestationState;
  /** Statement (free text). */
  statement: string;
  /** Submitted by (user id or 'system'). */
  submittedBy: string;
  /** Optional verifier (user id or 'auto'). */
  verifiedBy?: string;
  /** Optional rejection reason. */
  reason?: string;
  /** SHA-256 of the statement. */
  statementHash: string;
}

export interface AttestationRequest {
  kind: AttestationKind;
  refId: string;
  statement: string;
  submittedBy: string;
  /** Validity in days. */
  validityDays?: number;
  /** Override submittedAt (test-only). */
  submittedAt?: string;
}

export interface AttestationPolicy {
  kind: AttestationKind;
  /** Required cadence in days. */
  cadenceDays: number;
  /** Whether sub-process needs external verifier. */
  requiresExternal?: boolean;
}

export interface AttestationReport {
  total: number;
  active: number;
  pending: number;
  expired: number;
  rejected: number;
}

export const ATTESTATION_ID_RE = /^att_[a-z0-9]{8,}$/;
export const DEFAULT_VALIDITY_DAYS = 365;
export const DEFAULT_RE_ATTEST_DAYS = 90;