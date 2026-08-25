/**
 * Compliance Attestation — NestJS auth service spec (Stage 125).
 */

import { ComplianceAttestationAuthService } from './compliance-attestation.auth.service';
import { Attestation, AttestationPolicy } from './compliance-attestation.types';

interface IPrismaMock { $queryRaw: (template: TemplateStringsArray) => Promise<unknown>; }
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() { return new ComplianceAttestationAuthService(makePrisma() as never); }
function a(over: Partial = {}): Attestation {
  return { id: 'att_abcdef12', kind: 'sub_process', refId: 'sp_1', submittedAt: '2026-01-01', expiresAt: '2027-01-01', state: 'verified', statement: 'We comply with controls.', submittedBy: 'u_1', verifiedBy: 'auto', statementHash: 'h', ...over };
}

describe('ComplianceAttestationAuthService.hash / validId / validStatement', () => {
  it('hash', () => { expect(setup().hash('x').length).toBe(64); });
  it('validId', () => { expect(setup().validId('att_abcdef12')).toBe(true); expect(setup().validId('bad')).toBe(false); });
  it('validStatement', () => { expect(setup().validStatement('a'.repeat(20))).toBe(true); expect(setup().validStatement('x')).toBe(false); });
});

describe('ComplianceAttestationAuthService.submit / verify / reject', () => {
  it('submit', () => { expect(setup().submit({ kind: 'sub_process', refId: 'sp_1', statement: 'a'.repeat(20), submittedBy: 'u' }, '2026-08-25').state).toBe('pending'); });
  it('verify', () => { expect(setup().verify(a(), 'v', '2026-08-25').state).toBe('verified'); });
  it('reject', () => { expect(setup().reject(a(), 'r', '2026-08-25').state).toBe('rejected'); });
});

describe('ComplianceAttestationAuthService.active / byKind / byRef / current', () => {
  it('active', () => { expect(setup().active(a(), '2026-08-25')).toBe(true); });
  it('byKind', () => { expect(setup().byKind([a()], 'sub_process').length).toBe(1); });
  it('byRef', () => { expect(setup().byRef([a()], 'sp_1').length).toBe(1); });
  it('current', () => { expect(setup().current([a()], 'sp_1', '2026-08-25')?.id).toBe('att_abcdef12'); });
});

describe('ComplianceAttestationAuthService.report / needs / expire / days / ping', () => {
  it('report', () => { expect(setup().report([a()], '2026-08-25').active).toBe(1); });
  it('needs', () => {
    const policy: AttestationPolicy = { kind: 'sub_process', cadenceDays: 90 };
    expect(setup().needs([], 'sp_1', policy, '2026-08-25')).toBe(true);
  });
  it('expire', () => { expect(setup().expire([a({ expiresAt: '2024-01-01' })], '2026-08-25')[0].state).toBe('expired'); });
  it('days', () => { expect(setup().days(a(), '2026-08-25')).toBeGreaterThan(0); });
  it('ping', async () => { expect(await setup().ping()).toBe(true); });
});