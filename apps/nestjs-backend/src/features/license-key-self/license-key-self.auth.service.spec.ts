/**
 * License key self up/downgrade — NestJS auth service spec (Stage 82).
 */

import { LicenseKeySelfAuthService } from './license-key-self.auth.service';

interface IPrismaMock {
  licenseKey: {
    update: (args: unknown) => Promise<unknown>;
  };
  licenseTierAudit: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    licenseKey: { update: vi.fn().mockResolvedValue(undefined) },
    licenseTierAudit: {
      create: vi.fn().mockResolvedValue(undefined),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('LicenseKeySelfAuthService.preview', () => {
  it('returns proration', async () => {
    const svc = new LicenseKeySelfAuthService(makePrisma() as never);
    const out = await svc.preview({
      request: {
        licenseId: 'l1',
        from: 'pro',
        to: 'business',
        effectiveAt: '2026-01-16T00:00:00Z',
      },
      cycleStart: '2026-01-01T00:00:00Z',
      now: '2026-01-10T00:00:00Z',
    });
    expect(out.direction).toBe('upgrade');
    expect(out.toCents).toBe(7900);
  });
  it('rejects invalid', async () => {
    const svc = new LicenseKeySelfAuthService(makePrisma() as never);
    await expect(
      svc.preview({
        request: {
          licenseId: 'l1',
          from: 'pro',
          to: 'pro',
          effectiveAt: '2026-01-16T00:00:00Z',
        },
        cycleStart: '2026-01-01T00:00:00Z',
        now: '2026-01-10T00:00:00Z',
      })
    ).rejects.toThrow();
  });
});

describe('LicenseKeySelfAuthService.cooldownFor', () => {
  it('returns canChange when no prior', async () => {
    const svc = new LicenseKeySelfAuthService(makePrisma() as never);
    const out = await svc.cooldownFor({
      licenseId: 'l1',
      now: '2026-01-10T00:00:00Z',
    });
    expect(out.canChange).toBe(true);
  });
});

describe('LicenseKeySelfAuthService.apply', () => {
  it('persists update and audit', async () => {
    const prisma = makePrisma();
    const svc = new LicenseKeySelfAuthService(prisma as never);
    const audit = await svc.apply({
      request: {
        licenseId: 'l1',
        from: 'pro',
        to: 'business',
        effectiveAt: '2026-01-16T00:00:00Z',
        reason: 'growth',
        actorId: 'u1',
      },
      now: '2026-01-10T00:00:00Z',
    });
    expect(audit.direction).toBe('upgrade');
    expect(audit.reason).toBe('growth');
    expect(prisma.licenseKey.update).toHaveBeenCalledTimes(1);
    expect(prisma.licenseTierAudit.create).toHaveBeenCalledTimes(1);
  });
  it('rejects on cooldown', async () => {
    const prisma = makePrisma();
    (prisma.licenseTierAudit.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      effectiveAt: new Date('2026-01-09T00:00:00Z'),
    });
    const svc = new LicenseKeySelfAuthService(prisma as never);
    await expect(
      svc.apply({
        request: {
          licenseId: 'l1',
          from: 'pro',
          to: 'business',
          effectiveAt: '2026-01-16T00:00:00Z',
        },
        now: '2026-01-10T00:00:00Z',
      })
    ).rejects.toThrow(/cooldown/);
  });
});

describe('LicenseKeySelfAuthService helpers', () => {
  it('exposes appendAudit', () => {
    const svc = new LicenseKeySelfAuthService(makePrisma() as never);
    expect(typeof svc.appendAudit).toBe('function');
  });
});
