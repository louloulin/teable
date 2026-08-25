/**
 * Email domain claim NestJS auth service — persistence is mocked.
 */

import { EmailDomainClaimAuthService } from './email-domain-claim.auth.service';
import type { IEmailDomainClaim } from './email-domain-claim.types';

interface IPrismaMock {
  emailDomainClaim: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  emailDomainClaimAudit: {
    create: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    emailDomainClaim: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    emailDomainClaimAudit: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
}

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

describe('EmailDomainClaimAuthService.validateDomain', () => {
  it('passes acme.com', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(svc.validateDomain('acme.com')).toBeNull();
  });
  it('rejects invalid', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(svc.validateDomain('a..b')).toBeTruthy();
  });
});

describe('EmailDomainClaimAuthService.validate', () => {
  it('passes healthy claim', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(svc.validate(baseClaim())).toBeNull();
  });
});

describe('EmailDomainClaimAuthService.normalize', () => {
  it('lowercases domain', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    const c = svc.normalize({ id: 'c1', orgId: 'o1', domain: 'Acme.com' });
    expect(c.domain).toBe('acme.com');
  });
});

describe('EmailDomainClaimAuthService.renderDnsRecord', () => {
  it('renders TXT record', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    const rec = svc.renderDnsRecord({ domain: 'acme.com', token: 'abc' });
    expect(rec.host).toBe('_teable-verify.acme.com');
    expect(rec.type).toBe('TXT');
  });
});

describe('EmailDomainClaimAuthService.upsertClaim', () => {
  it('persists via prisma upsert', async () => {
    const prisma = makePrisma();
    const svc = new EmailDomainClaimAuthService(prisma as never);
    await svc.upsertClaim(baseClaim());
    expect(prisma.emailDomainClaim.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    await expect(svc.upsertClaim(baseClaim({ id: '' }))).rejects.toThrow(/invalid claim/);
  });
});

describe('EmailDomainClaimAuthService.loadClaim', () => {
  it('returns null when missing', async () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(await svc.loadClaim('missing')).toBeNull();
  });
});

describe('EmailDomainClaimAuthService.listClaims', () => {
  it('parses rows', async () => {
    const prisma = makePrisma();
    (prisma.emailDomainClaim.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c1',
        orgId: 'o1',
        domain: 'acme.com',
        token: 'tok',
        status: 'pending',
        mode: 'review',
        defaultRoleId: null,
        lastCheckedAt: null,
        lastError: null,
        verifiedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new EmailDomainClaimAuthService(prisma as never);
    const rows = await svc.listClaims('o1');
    expect(rows).toHaveLength(1);
  });
});

describe('EmailDomainClaimAuthService.findMatchingClaim', () => {
  it('returns first verified claim for email domain', async () => {
    const prisma = makePrisma();
    (prisma.emailDomainClaim.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c1',
        orgId: 'o1',
        domain: 'acme.com',
        token: 'tok',
        status: 'verified',
        mode: 'open',
        defaultRoleId: null,
        lastCheckedAt: null,
        lastError: null,
        verifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new EmailDomainClaimAuthService(prisma as never);
    const c = await svc.findMatchingClaim('alice@acme.com');
    expect(c?.domain).toBe('acme.com');
  });
  it('returns null when no @', async () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(await svc.findMatchingClaim('not-an-email')).toBeNull();
  });
});

describe('EmailDomainClaimAuthService.checkDomain', () => {
  it('verifies when token matches', async () => {
    const prisma = makePrisma();
    (prisma.emailDomainClaim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1',
      orgId: 'o1',
      domain: 'acme.com',
      token: 'abc',
      status: 'pending',
      mode: 'review',
      defaultRoleId: null,
      lastCheckedAt: null,
      lastError: null,
      verifiedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new EmailDomainClaimAuthService(prisma as never);
    const c = await svc.checkDomain({
      claimId: 'c1',
      resolve: async () => 'abc',
    });
    expect(c.status).toBe('verified');
  });
  it('fails when resolver returns null', async () => {
    const prisma = makePrisma();
    (prisma.emailDomainClaim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1',
      orgId: 'o1',
      domain: 'acme.com',
      token: 'abc',
      status: 'pending',
      mode: 'review',
      defaultRoleId: null,
      lastCheckedAt: null,
      lastError: null,
      verifiedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new EmailDomainClaimAuthService(prisma as never);
    const c = await svc.checkDomain({ claimId: 'c1', resolve: async () => null });
    expect(c.status).toBe('failed');
  });
  it('throws when claim missing', async () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    await expect(
      svc.checkDomain({ claimId: 'missing', resolve: async () => null })
    ).rejects.toThrow(/not found/);
  });
});

describe('EmailDomainClaimAuthService.match / shouldAutoJoin', () => {
  it('returns null when not verified', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(svc.match(baseClaim({ status: 'pending' }), 'alice@acme.com')).toBeNull();
  });
  it('returns null when mode=locked', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(
      svc.shouldAutoJoin(baseClaim({ status: 'verified', mode: 'locked' }), {
        userId: 'u',
        email: 'a@acme.com',
        matchDomain: 'acme.com',
        claimId: 'c1',
        requiresReview: false,
        suggestedRoleId: 'r',
      })
    ).toBe(false);
  });
});

describe('EmailDomainClaimAuthService.canClaimMore', () => {
  it('honors', () => {
    const svc = new EmailDomainClaimAuthService(makePrisma() as never);
    expect(svc.canClaimMore(15)).toBe(true);
    expect(svc.canClaimMore(16)).toBe(false);
  });
});

describe('EmailDomainClaimAuthService.recordAudit', () => {
  it('persists via prisma create', async () => {
    const prisma = makePrisma();
    const svc = new EmailDomainClaimAuthService(prisma as never);
    await svc.recordAudit({
      id: 'a1',
      orgId: 'o1',
      domain: 'acme.com',
      action: 'verify',
      actorId: 'admin',
      details: '',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(prisma.emailDomainClaimAudit.create).toHaveBeenCalledTimes(1);
  });
});
