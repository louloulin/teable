/**
 * Compliance Attestation — pure helpers spec (Stage 125).
 */

import {
  buildAttestationId,
  daysUntilExpiry,
  expireOverdue,
  filterByKind,
  filterByRef,
  findActive,
  hashStatement,
  isActive,
  isAttestationIdValid,
  isStatementValid,
  needsReAttestation,
  rejectAttestation,
  submitAttestation,
  summarize,
  verifyAttestation,
} from './compliance-attestation.service';
import { Attestation, AttestationPolicy } from './compliance-attestation.types';

function att(over: Partial<Attestation> = {}): Attestation {
  return {
    id: 'att_abcdef12',
    kind: 'sub_process',
    refId: 'sp_1',
    submittedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2027-01-01T00:00:00Z',
    state: 'verified',
    statement: 'We process customer data per SOC2 controls.',
    submittedBy: 'user_1',
    verifiedBy: 'auto',
    statementHash: 'a'.repeat(64),
    ...over,
  };
}

describe('compliance-attestation.hashStatement / isAttestationIdValid / buildAttestationId', () => {
  it('hash stable', () => { expect(hashStatement('x')).toBe(hashStatement('x')); });
  it('hash length', () => { expect(hashStatement('x').length).toBe(64); });
  it('valid id', () => { expect(isAttestationIdValid('att_abcdef12')).toBe(true); expect(isAttestationIdValid('bad')).toBe(false); });
  it('build id matches regex', () => { expect(buildAttestationId('a', 'sub_process', 'h')).toMatch(/^att_/); });
});

describe('compliance-attestation.isStatementValid', () => {
  it('valid', () => { expect(isStatementValid('a'.repeat(20))).toBe(true); });
  it('too short', () => { expect(isStatementValid('short')).toBe(false); });
  it('too long', () => { expect(isStatementValid('a'.repeat(5000))).toBe(false); });
});

describe('compliance-attestation.submitAttestation', () => {
  it('basic', () => {
    const a = submitAttestation({ kind: 'sub_process', refId: 'sp_1', statement: 'We comply with controls.', submittedBy: 'u_1' }, '2026-08-25');
    expect(a.state).toBe('pending');
    expect(a.expiresAt > a.submittedAt).toBe(true);
  });
  it('validityDays=30', () => {
    const a = submitAttestation({ kind: 'sub_process', refId: 'sp_1', statement: 'We comply with controls.', submittedBy: 'u_1', validityDays: 30 }, '2026-08-25');
    expect(new Date(a.expiresAt).getTime() - new Date(a.submittedAt).getTime()).toBe(30 * 86400 * 1000);
  });
});

describe('compliance-attestation.verifyAttestation', () => {
  it('verified', () => {
    const a = verifyAttestation(att(), 'verifier_1', '2026-08-25');
    expect(a.state).toBe('verified');
    expect(a.verifiedBy).toBe('verifier_1');
  });
  it('expired', () => {
    const a = verifyAttestation(att({ expiresAt: '2024-01-01' }), 'v', '2026-08-25');
    expect(a.state).toBe('expired');
  });
});

describe('compliance-attestation.rejectAttestation', () => {
  it('rejected', () => {
    const a = rejectAttestation(att(), 'missing evidence');
    expect(a.state).toBe('rejected');
    expect(a.reason).toBe('missing evidence');
  });
});

describe('compliance-attestation.isActive', () => {
  it('true', () => { expect(isActive(att(), '2026-08-25')).toBe(true); });
  it('false (expired)', () => { expect(isActive(att({ expiresAt: '2024-01-01' }), '2026-08-25')).toBe(false); });
});

describe('compliance-attestation.filterByKind / filterByRef / findActive', () => {
  it('by kind', () => { expect(filterByKind([att(), att({ kind: 'control' })], 'control').length).toBe(1); });
  it('by ref', () => { expect(filterByRef([att({ refId: 'a' }), att({ refId: 'b' })], 'a').length).toBe(1); });
  it('find active', () => { expect(findActive([att()], 'sp_1', '2026-08-25')?.id).toBe('att_abcdef12'); });
});

describe('compliance-attestation.summarize / expireOverdue / daysUntilExpiry', () => {
  it('summary', () => {
    const r = summarize([att(), att({ state: 'pending' }), att({ state: 'rejected' })], '2026-08-25');
    expect(r.active).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.rejected).toBe(1);
  });
  it('expireOverdue', () => {
    const out = expireOverdue([att({ expiresAt: '2024-01-01' })], '2026-08-25');
    expect(out[0].state).toBe('expired');
  });
  it('days', () => {
    expect(daysUntilExpiry(att(), '2026-08-25')).toBeGreaterThan(0);
  });
});

describe('compliance-attestation.needsReAttestation', () => {
  const policy: AttestationPolicy = { kind: 'sub_process', cadenceDays: 90 };
  it('yes (no active)', () => { expect(needsReAttestation([], 'x', policy, '2026-08-25')).toBe(true); });
  it('no (recent)', () => { expect(needsReAttestation([att({ submittedAt: '2026-08-01' })], 'sp_1', policy, '2026-08-25')).toBe(false); });
  it('yes (old)', () => { expect(needsReAttestation([att({ submittedAt: '2025-01-01' })], 'sp_1', policy, '2026-08-25')).toBe(true); });
});