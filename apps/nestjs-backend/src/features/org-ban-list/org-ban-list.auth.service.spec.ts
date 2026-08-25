/**
 * Org ban list — NestJS auth service spec (Stage 77).
 */

import { OrgBanListAuthService } from './org-ban-list.auth.service';
import type { IBanEntry } from './org-ban-list.types';

interface IPrismaMock {
  orgBanEntry: {
    create: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    update: (args: unknown) => Promise<unknown>;
  };
  orgBanAudit: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    orgBanEntry: {
      create: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
    },
    orgBanAudit: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const baseEntry = (over: Partial<IBanEntry> = {}): IBanEntry => ({
  id: 'e1',
  orgId: 'o1',
  kind: 'ip',
  value: '1.2.3.4',
  mode: 'block',
  reason: 'spam',
  expiresAt: null,
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModifiedBy: null,
  revokedAt: null,
  ...over,
});

describe('OrgBanListAuthService.createEntry', () => {
  it('persists entry and audit', async () => {
    const prisma = makePrisma();
    const svc = new OrgBanListAuthService(prisma as never);
    const { entry, audit } = await svc.createEntry({
      id: 'e1',
      orgId: 'o1',
      kind: 'ip',
      value: '1.2.3.4',
      mode: 'block',
      reason: 'spam',
      expiresAt: null,
      createdBy: 'admin',
      auditId: 'a1',
      now: '2026-01-01T00:00:00Z',
    });
    expect(entry.value).toBe('1.2.3.4');
    expect(audit.action).toBe('create');
    expect(prisma.orgBanEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.orgBanAudit.create).toHaveBeenCalledTimes(1);
  });
});

describe('OrgBanListAuthService.revokeEntry', () => {
  it('revokes when present', async () => {
    const prisma = makePrisma();
    (prisma.orgBanEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'e1',
      orgId: 'o1',
      kind: 'ip',
      value: '1.2.3.4',
      mode: 'block',
      reason: 'spam',
      expiresAt: null,
      createdBy: 'admin',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastModifiedBy: null,
      revokedAt: null,
    });
    const svc = new OrgBanListAuthService(prisma as never);
    const out = await svc.revokeEntry({
      entryId: 'e1',
      orgId: 'o1',
      revokedBy: 'admin2',
      auditId: 'a1',
      now: '2026-02-01T00:00:00Z',
    });
    expect(out).not.toBeNull();
    expect(out!.entry.revokedAt).toBe('2026-02-01T00:00:00Z');
    expect(prisma.orgBanEntry.update).toHaveBeenCalledTimes(1);
  });
  it('returns null when missing', async () => {
    const prisma = makePrisma();
    const svc = new OrgBanListAuthService(prisma as never);
    const out = await svc.revokeEntry({
      entryId: 'missing',
      orgId: 'o1',
      revokedBy: 'admin',
      auditId: 'a1',
      now: '2026-02-01T00:00:00Z',
    });
    expect(out).toBeNull();
  });
});

describe('OrgBanListAuthService.loadAuditTrail', () => {
  it('rebuilds rows', async () => {
    const prisma = makePrisma();
    (prisma.orgBanAudit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'a1',
        orgId: 'o1',
        entryId: 'e1',
        action: 'create',
        actorId: 'admin',
        detail: 'create',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new OrgBanListAuthService(prisma as never);
    const trail = await svc.loadAuditTrail('e1');
    expect(trail.length).toBe(1);
    expect(trail[0]!.action).toBe('create');
  });
});

describe('OrgBanListAuthService.decide', () => {
  it('returns neutral when no rows', async () => {
    const prisma = makePrisma();
    const svc = new OrgBanListAuthService(prisma as never);
    const out = await svc.decide({
      candidate: { kind: 'ip', value: '9.9.9.9' },
      orgId: 'o1',
      now: '2026-01-02T00:00:00Z',
    });
    expect(out).toBe('neutral');
  });
  it('returns block when matching block row', async () => {
    const prisma = makePrisma();
    (prisma.orgBanEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'e1',
        orgId: 'o1',
        kind: 'ip',
        value: '1.2.3.4',
        mode: 'block',
        reason: 'spam',
        expiresAt: null,
        createdBy: 'admin',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastModifiedBy: null,
        revokedAt: null,
      },
    ]);
    const svc = new OrgBanListAuthService(prisma as never);
    const out = await svc.decide({
      candidate: { kind: 'ip', value: '1.2.3.4' },
      orgId: 'o1',
      now: '2026-01-02T00:00:00Z',
    });
    expect(out).toBe('block');
  });
});

describe('OrgBanListAuthService.remainingLifetime', () => {
  it('null when no expiry', () => {
    const svc = new OrgBanListAuthService(makePrisma() as never);
    expect(svc.remainingLifetime({ entry: baseEntry(), now: '2026-01-02T00:00:00Z' })).toBeNull();
  });
});

describe('OrgBanListAuthService.appendAudit', () => {
  it('writes audit row', async () => {
    const prisma = makePrisma();
    const svc = new OrgBanListAuthService(prisma as never);
    const audit = await svc.appendAudit({
      id: 'a1',
      orgId: 'o1',
      entryId: 'e1',
      action: 'edit',
      actorId: 'admin',
      detail: 'mode change',
      now: '2026-01-02T00:00:00Z',
    });
    expect(audit.action).toBe('edit');
    expect(prisma.orgBanAudit.create).toHaveBeenCalledTimes(1);
  });
});

describe('OrgBanListAuthService.trimLog', () => {
  it('returns capped log', () => {
    const svc = new OrgBanListAuthService(makePrisma() as never);
    const out = svc.trimLog({
      log: Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        orgId: 'o1',
        entryId: 'e1',
        action: 'edit' as const,
        actorId: 'admin',
        detail: 'x',
        occurredAt: '2026-01-01T00:00:00Z',
      })),
      cap: 4,
    });
    expect(out.length).toBeLessThanOrEqual(4);
  });
});
