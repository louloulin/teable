import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

import { hashSwitchToken, WorkspaceSwitchAuthService } from './workspace-switch.auth.service';

interface IMockSessionTable {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockGrantTable {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  workspaceSwitchSession: IMockSessionTable;
  crossOrgAdminGrant: IMockGrantTable;
}

const buildPrisma = (): IMockPrisma => ({
  workspaceSwitchSession: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  crossOrgAdminGrant: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

describe('WorkspaceSwitchAuthService (Stage 27)', () => {
  let prisma: IMockPrisma;
  let svc: WorkspaceSwitchAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new WorkspaceSwitchAuthService(prisma as never);
  });

  describe('createSwitch', () => {
    it('persists a hashed token and returns the raw token', async () => {
      const { token, session } = await svc.createSwitch({
        userId: 'u1',
        fromSpaceId: 's1',
        toSpaceId: 's2',
        ttlSeconds: 60,
      });
      expect(token).toMatch(/^wss_/);
      expect(session.token).toBe(hashSwitchToken(token));
      expect(session.userId).toBe('u1');
      expect(session.toSpaceId).toBe('s2');
    });

    it('rejects when toSpaceId equals fromSpaceId', async () => {
      await expect(
        svc.createSwitch({ userId: 'u1', fromSpaceId: 's1', toSpaceId: 's1' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing required fields', async () => {
      await expect(
        svc.createSwitch({ userId: '', fromSpaceId: null, toSpaceId: 's1' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('consumeSwitch', () => {
    it('marks the session consumed and returns the target space', async () => {
      const raw = 'wss_abc';
      const stored = {
        id: 'wss_1',
        userId: 'u1',
        fromSpaceId: 's1',
        toSpaceId: 's2',
        token: hashSwitchToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdTime: new Date(),
      };
      prisma.workspaceSwitchSession.findFirst.mockResolvedValueOnce(stored);
      const r = await svc.consumeSwitch({ userId: 'u1', presentedToken: raw });
      expect(r.ok).toBe(true);
      expect(r.toSpaceId).toBe('s2');
      expect(prisma.workspaceSwitchSession.update).toHaveBeenCalledTimes(1);
    });

    it('refuses mismatched tokens without consuming', async () => {
      const stored = {
        id: 'wss_1',
        userId: 'u1',
        fromSpaceId: 's1',
        toSpaceId: 's2',
        token: hashSwitchToken('wss_real'),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdTime: new Date(),
      };
      prisma.workspaceSwitchSession.findFirst.mockResolvedValueOnce(stored);
      const r = await svc.consumeSwitch({ userId: 'u1', presentedToken: 'wss_other' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('unknown');
      expect(prisma.workspaceSwitchSession.update).not.toHaveBeenCalled();
    });

    it('refuses already-expired sessions without consuming', async () => {
      const stored = {
        id: 'wss_1',
        userId: 'u1',
        fromSpaceId: null,
        toSpaceId: 's2',
        token: hashSwitchToken('wss_x'),
        expiresAt: new Date(Date.now() - 60_000),
        consumedAt: null,
        createdTime: new Date(),
      };
      prisma.workspaceSwitchSession.findFirst.mockResolvedValueOnce(stored);
      const r = await svc.consumeSwitch({ userId: 'u1', presentedToken: 'wss_x' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('expired');
      expect(prisma.workspaceSwitchSession.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('returns the deleted count', async () => {
      prisma.workspaceSwitchSession.deleteMany.mockResolvedValueOnce({ count: 3 });
      const n = await svc.revokeAllForUser('u1');
      expect(n).toBe(3);
    });
  });

  describe('grantCrossOrg', () => {
    it('writes a grant row', async () => {
      const out = await svc.grantCrossOrg({
        userId: 'u1',
        spaceId: 's2',
        grantedBy: 'u_owner',
        role: 'admin',
        reason: 'incident response',
        ttlSeconds: 3600,
      });
      expect(out.id).toMatch(/^coag_/);
      expect(out.expiresAt).not.toBeNull();
    });

    it('allows a non-expiring grant', async () => {
      const out = await svc.grantCrossOrg({
        userId: 'u1',
        spaceId: 's2',
        grantedBy: 'u_owner',
        role: 'owner',
      });
      expect(out.expiresAt).toBeNull();
    });

    it('rejects missing required fields', async () => {
      await expect(
        svc.grantCrossOrg({ userId: '', spaceId: 's2', grantedBy: 'u1', role: 'admin' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('revokeCrossOrg', () => {
    it('soft-revokes an active grant', async () => {
      prisma.crossOrgAdminGrant.findUnique.mockResolvedValueOnce({
        id: 'coag_1',
        revokedAt: null,
      });
      const ok = await svc.revokeCrossOrg('coag_1');
      expect(ok).toBe(true);
    });

    it('returns false when already revoked or missing', async () => {
      prisma.crossOrgAdminGrant.findUnique.mockResolvedValueOnce(null);
      expect(await svc.revokeCrossOrg('coag_x')).toBe(false);
      prisma.crossOrgAdminGrant.findUnique.mockResolvedValueOnce({
        id: 'coag_1',
        revokedAt: new Date(),
      });
      expect(await svc.revokeCrossOrg('coag_1')).toBe(false);
    });
  });

  describe('effectiveRole', () => {
    it('returns base role when no active grant exists', async () => {
      const r = await svc.effectiveRole({
        userId: 'u1',
        spaceId: 's2',
        baseRole: 'admin',
      });
      expect(r).toEqual({ baseRole: 'admin', elevated: false, effective: 'admin' });
    });

    it('promotes the role when an active owner grant exists', async () => {
      prisma.crossOrgAdminGrant.findFirst.mockResolvedValueOnce({
        id: 'coag_1',
        role: 'owner',
        expiresAt: null,
        revokedAt: null,
      });
      const r = await svc.effectiveRole({
        userId: 'u1',
        spaceId: 's2',
        baseRole: 'admin',
      });
      expect(r.elevated).toBe(true);
      expect(r.effective).toBe('owner');
    });

    it('does not promote when the grant is revoked', async () => {
      prisma.crossOrgAdminGrant.findFirst.mockResolvedValueOnce({
        id: 'coag_1',
        role: 'owner',
        expiresAt: null,
        revokedAt: new Date('2026-08-01T00:00:00Z'),
      });
      const r = await svc.effectiveRole({
        userId: 'u1',
        spaceId: 's2',
        baseRole: 'admin',
      });
      expect(r.elevated).toBe(false);
      expect(r.effective).toBe('admin');
    });

    it('does not promote when the grant is expired', async () => {
      prisma.crossOrgAdminGrant.findFirst.mockResolvedValueOnce({
        id: 'coag_1',
        role: 'owner',
        expiresAt: new Date('2026-08-01T00:00:00Z'),
        revokedAt: null,
      });
      const r = await svc.effectiveRole({
        userId: 'u1',
        spaceId: 's2',
        baseRole: 'admin',
      });
      expect(r.elevated).toBe(false);
    });
  });
});
