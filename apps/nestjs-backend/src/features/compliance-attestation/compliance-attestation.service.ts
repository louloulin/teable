/**
 * Compliance Attestation — pure helpers (Stage 125).
 */

import { createHash } from 'node:crypto';

import {
  Attestation,
  AttestationKind,
  AttestationPolicy,
  AttestationReport,
  AttestationRequest,
  DEFAULT_VALIDITY_DAYS,
} from './compliance-attestation.types';

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
}

/** SHA-256 hex of a statement. */
export function hashStatement(statement: string): string {
  return createHash('sha256').update(statement).digest('hex');
}

/** Build attestation id. */
export function buildAttestationId(refId: string, kind: AttestationKind, statementHash: string): string {
  return `att_${hashStr(`${refId}:${kind}:${statementHash.slice(0, 8)}`)}`;
}

/** Validate attestation id format. */
export function isAttestationIdValid(id: string): boolean {
  return /^att_[a-z0-9]{8,}$/.test(id);
}

/** Submit a new attestation. */
export function submitAttestation(req: AttestationRequest, now: string = new Date().toISOString()): Attestation {
  const validity = req.validityDays ?? DEFAULT_VALIDITY_DAYS;
  const submittedAt = req.submittedAt ?? now;
  const expiresAt = new Date(new Date(submittedAt).getTime() + validity * 86400 * 1000).toISOString();
  const sh = hashStatement(req.statement);
  return {
    id: buildAttestationId(req.refId, req.kind, sh),
    kind: req.kind,
    refId: req.refId,
    submittedAt,
    expiresAt,
    state: 'pending',
    statement: req.statement,
    submittedBy: req.submittedBy,
    statementHash: sh,
  };
}

/** Verify an attestation (transition to 'verified'). */
export function verifyAttestation(att: Attestation, verifier: string, now: string = new Date().toISOString()): Attestation {
  if (att.expiresAt <= now) return { ...att, state: 'expired' };
  return { ...att, state: 'verified', verifiedBy: verifier };
}

/** Reject an attestation. */
export function rejectAttestation(att: Attestation, reason: string, now: string = new Date().toISOString()): Attestation {
  return { ...att, state: 'rejected', reason, verifiedBy: att.verifiedBy ?? 'auto' };
}

/** Check if an attestation is currently active. */
export function isActive(att: Attestation, now: string = new Date().toISOString()): boolean {
  return att.state === 'verified' && att.expiresAt > now;
}

/** Filter attestations by kind. */
export function filterByKind(atts: readonly Attestation[], kind: AttestationKind): Attestation[] {
  return atts.filter((a) => a.kind === kind);
}

/** Filter attestations by reference id. */
export function filterByRef(atts: readonly Attestation[], refId: string): Attestation[] {
  return atts.filter((a) => a.refId === refId);
}

/** Find active attestation for a ref. */
export function findActive(atts: readonly Attestation[], refId: string, now: string = new Date().toISOString()): Attestation | undefined {
  return atts.filter((a) => a.refId === refId).find((a) => isActive(a, now));
}

/** Aggregate report. */
export function summarize(atts: readonly Attestation[], now: string = new Date().toISOString()): AttestationReport {
  let active = 0, pending = 0, expired = 0, rejected = 0;
  for (const a of atts) {
    if (a.state === 'verified' && a.expiresAt > now) active++;
    else if (a.state === 'pending') pending++;
    else if (a.state === 'expired' || (a.state === 'verified' && a.expiresAt <= now)) expired++;
    else if (a.state === 'rejected') rejected++;
  }
  return { total: atts.length, active, pending, expired, rejected };
}

/** Decide whether a ref needs re-attestation given a policy. */
export function needsReAttestation(atts: readonly Attestation[], refId: string, policy: AttestationPolicy, now: string = new Date().toISOString()): boolean {
  const a = findActive(atts, refId, now);
  if (!a) return true;
  const ageMs = new Date(now).getTime() - new Date(a.submittedAt).getTime();
  return ageMs > policy.cadenceDays * 86400 * 1000;
}

/** Apply a policy threshold and mark stale attestations expired. */
export function expireOverdue(atts: readonly Attestation[], now: string = new Date().toISOString()): Attestation[] {
  return atts.map((a) => (a.expiresAt <= now && a.state === 'verified' ? { ...a, state: 'expired' as const } : a));
}

/** Compute days-until-expiry. */
export function daysUntilExpiry(att: Attestation, now: string = new Date().toISOString()): number {
  return Math.floor((new Date(att.expiresAt).getTime() - new Date(now).getTime()) / 86400 / 1000);
}

/** Validate attestation statement length. */
export function isStatementValid(statement: string): boolean {
  return statement.length >= 16 && statement.length <= 4096;
}