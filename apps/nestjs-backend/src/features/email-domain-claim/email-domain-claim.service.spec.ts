import {
  applyDnsCheck,
  canClaimMore,
  countVerified,
  defaultTokenLength,
  generateToken,
  isClaimMode,
  isClaimStatus,
  matchCandidate,
  maxDomainsPerOrg,
  normalizeClaim,
  normalizeDomain,
  parseVerificationValue,
  renderVerificationRecord,
  shouldAutoJoin,
  validateClaim,
  validateDomain,
} from './email-domain-claim.service';
import type { IEmailDomainClaim } from './email-domain-claim.types';
import { DOMAIN_VERIFICATION_PREFIX, MAX_DOMAINS_PER_ORG } from './email-domain-claim.types';

const baseClaim = (over: Partial<IEmailDomainClaim> = {}): IEmailDomainClaim => ({
  id: 'c1',
  orgId: 'o1',
  domain: 'acme.com',
  token: 'tok-abc',
  status: 'pending',
  mode: 'review',
  defaultRoleId: 'editor',
  lastCheckedAt: null,
  lastError: null,
  verifiedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('email-domain-claim.isClaimStatus / isClaimMode', () => {
  it('accepts canonical', () => {
    expect(isClaimStatus('verified')).toBe(true);
    expect(isClaimMode('review')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isClaimStatus('expired')).toBe(false);
    expect(isClaimMode('always')).toBe(false);
  });
});

describe('email-domain-claim.defaultTokenLength & max', () => {
  it('returns default token length', () => {
    expect(defaultTokenLength()).toBe(32);
  });
  it('returns max domains per org', () => {
    expect(maxDomainsPerOrg()).toBe(MAX_DOMAINS_PER_ORG);
  });
});

describe('email-domain-claim.normalizeDomain', () => {
  it('lowercases + trims', () => {
    expect(normalizeDomain('  ACME.com  ')).toBe('acme.com');
  });
});

describe('email-domain-claim.validateDomain', () => {
  it('passes acme.com', () => {
    expect(validateDomain('acme.com')).toBeNull();
  });
  it('rejects too short', () => {
    expect(validateDomain('a.b')).toContain('domain length');
  });
  it('rejects too long', () => {
    expect(validateDomain('a'.repeat(254))).toContain('domain length');
  });
  it('rejects invalid chars', () => {
    expect(validateDomain('acme*.com')).toContain('invalid characters');
  });
  it('rejects no dot', () => {
    expect(validateDomain('acmecom')).toContain('must contain a dot');
  });
  it('rejects leading dot', () => {
    expect(validateDomain('.acme.com')).toContain('cannot start');
  });
  it('rejects trailing dot', () => {
    expect(validateDomain('acme.com.')).toContain('cannot start/end');
  });
  it('rejects consecutive dots', () => {
    expect(validateDomain('acme..com')).toContain('consecutive');
  });
});

describe('email-domain-claim.generateToken', () => {
  it('returns a string of requested length', () => {
    expect(generateToken(8).length).toBe(8);
    expect(generateToken(64).length).toBe(64);
  });
});

describe('email-domain-claim.renderVerificationRecord', () => {
  it('renders correct TXT record', () => {
    const rec = renderVerificationRecord({ domain: 'acme.com', token: 'abc' });
    expect(rec.host).toBe('_teable-verify.acme.com');
    expect(rec.type).toBe('TXT');
    expect(rec.value).toBe(`${DOMAIN_VERIFICATION_PREFIX}abc`);
  });
});

describe('email-domain-claim.parseVerificationValue', () => {
  it('parses prefixed value', () => {
    expect(parseVerificationValue(`${DOMAIN_VERIFICATION_PREFIX}abc`)).toBe('abc');
  });
  it('returns null for missing prefix', () => {
    expect(parseVerificationValue('something-else')).toBeNull();
  });
});

describe('email-domain-claim.validateClaim', () => {
  it('passes a healthy claim', () => {
    expect(validateClaim(baseClaim())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateClaim(baseClaim({ id: '' }))).toContain('id');
  });
  it('rejects missing orgId', () => {
    expect(validateClaim(baseClaim({ orgId: '' }))).toContain('orgId');
  });
  it('rejects invalid domain', () => {
    expect(validateClaim(baseClaim({ domain: 'a' }))).toContain('domain');
  });
  it('rejects missing token', () => {
    expect(validateClaim(baseClaim({ token: '' }))).toContain('token');
  });
  it('rejects verified without verifiedAt', () => {
    expect(validateClaim(baseClaim({ status: 'verified' }))).toContain('verifiedAt');
  });
});

describe('email-domain-claim.normalizeClaim', () => {
  it('lowercases domain + defaults', () => {
    const c = normalizeClaim({
      id: 'c1',
      orgId: 'o1',
      domain: 'Acme.com',
    });
    expect(c.domain).toBe('acme.com');
    expect(c.status).toBe('pending');
    expect(c.mode).toBe('review');
    expect(c.token.length).toBe(32);
  });
});

describe('email-domain-claim.applyDnsCheck', () => {
  it('fails when no observed value', () => {
    const c = applyDnsCheck({ claim: baseClaim(), observedValue: null });
    expect(c.status).toBe('failed');
    expect(c.lastError).toContain('no TXT');
  });
  it('fails when token mismatches', () => {
    const c = applyDnsCheck({
      claim: baseClaim({ token: 'expected' }),
      observedValue: `${DOMAIN_VERIFICATION_PREFIX}other`,
    });
    expect(c.status).toBe('failed');
    expect(c.lastError).toContain('mismatch');
  });
  it('verifies when token matches', () => {
    const c = applyDnsCheck({
      claim: baseClaim({ token: 'abc' }),
      observedValue: `${DOMAIN_VERIFICATION_PREFIX}abc`,
    });
    expect(c.status).toBe('verified');
    expect(c.verifiedAt).toBeTruthy();
  });
});

describe('email-domain-claim.matchCandidate', () => {
  it('matches verified claim', () => {
    const c = matchCandidate({
      claim: baseClaim({ status: 'verified' }),
      email: 'alice@acme.com',
    });
    expect(c?.matchDomain).toBe('acme.com');
    expect(c?.requiresReview).toBe(true);
  });
  it('returns null when not verified', () => {
    expect(
      matchCandidate({ claim: baseClaim({ status: 'pending' }), email: 'alice@acme.com' })
    ).toBeNull();
  });
  it('returns null when domain differs', () => {
    expect(
      matchCandidate({ claim: baseClaim({ status: 'verified' }), email: 'bob@other.com' })
    ).toBeNull();
  });
  it('requiresReview false when mode=open', () => {
    const c = matchCandidate({
      claim: baseClaim({ status: 'verified', mode: 'open' }),
      email: 'a@acme.com',
    });
    expect(c?.requiresReview).toBe(false);
  });
});

describe('email-domain-claim.shouldAutoJoin', () => {
  it('false if claim not verified', () => {
    const c = matchCandidate({ claim: baseClaim(), email: 'a@acme.com' });
    expect(c).toBeNull();
    expect(
      shouldAutoJoin({
        claim: baseClaim({ status: 'pending' }),
        candidate: {
          userId: 'u',
          email: 'a@acme.com',
          matchDomain: 'acme.com',
          claimId: 'c1',
          requiresReview: false,
          suggestedRoleId: 'r',
        },
      })
    ).toBe(false);
  });
  it('false when mode=locked', () => {
    const candidate = {
      userId: 'u',
      email: 'a@acme.com',
      matchDomain: 'acme.com',
      claimId: 'c1',
      requiresReview: false,
      suggestedRoleId: 'r',
    };
    expect(
      shouldAutoJoin({ claim: baseClaim({ status: 'verified', mode: 'locked' }), candidate })
    ).toBe(false);
  });
  it('true when verified + mode=open + no review', () => {
    const candidate = {
      userId: 'u',
      email: 'a@acme.com',
      matchDomain: 'acme.com',
      claimId: 'c1',
      requiresReview: false,
      suggestedRoleId: 'r',
    };
    expect(
      shouldAutoJoin({ claim: baseClaim({ status: 'verified', mode: 'open' }), candidate })
    ).toBe(true);
  });
});

describe('email-domain-claim.countVerified / canClaimMore', () => {
  it('counts verified', () => {
    expect(
      countVerified([
        baseClaim(),
        baseClaim({ status: 'verified' }),
        baseClaim({ status: 'failed' }),
      ])
    ).toBe(1);
  });
  it('canClaimMore', () => {
    expect(canClaimMore(MAX_DOMAINS_PER_ORG - 1)).toBe(true);
    expect(canClaimMore(MAX_DOMAINS_PER_ORG)).toBe(false);
  });
});
