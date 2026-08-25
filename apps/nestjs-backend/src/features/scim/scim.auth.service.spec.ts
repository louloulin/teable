import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

import { ScimAuthService } from './scim.auth.service';
import { generateScimToken } from './scim.service';

interface MockUser {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface MockScimToken {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}
interface MockScimEvent {
  create: ReturnType<typeof vi.fn>;
}
interface MockPermissionRole {
  findMany: ReturnType<typeof vi.fn>;
}
interface MockPrisma {
  user: MockUser;
  scimToken: MockScimToken;
  scimEvent: MockScimEvent;
  permissionRole: MockPermissionRole;
}

const buildPrisma = (): MockPrisma => ({
  user: {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      email: data.email,
      name: data.name ?? null,
      deactivatedTime: data.deactivatedTime ?? null,
    })),
    update: vi.fn(async ({ where, data }) => ({
      id: where.id,
      email: data.email,
      name: data.name ?? null,
      deactivatedTime: data.deactivatedTime ?? null,
    })),
  },
  scimToken: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }) => data),
    update: vi.fn(async ({ where, data }) => ({ ...data, id: where.id })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  scimEvent: {
    create: vi.fn(async ({ data }) => data),
  },
  permissionRole: {
    findMany: vi.fn(async () => []),
  },
});

const authFor = (orgId = 'org_1') => ({ tokenId: 't1', organizationId: orgId });

describe('ScimAuthService (Stage 23)', () => {
  let prisma: MockPrisma;
  let svc: ScimAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new ScimAuthService(prisma as never);
  });

  describe('createToken', () => {
    it('persists a token row with the hash, returns plaintext once', async () => {
      const out = await svc.createToken({
        organizationId: 'org_1',
        label: 'Okta',
        createdBy: 'u1',
      });
      expect(out.plaintext.startsWith('scim_')).toBe(true);
      expect(out.prefix).toHaveLength(4);
      expect(prisma.scimToken.create).toHaveBeenCalledTimes(1);
      const arg = prisma.scimToken.create.mock.calls[0][0];
      expect(arg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(arg.data.enabled).toBe(true);
    });
  });

  describe('verifyBearer', () => {
    it('throws when the header is missing', async () => {
      await expect(svc.verifyBearer(null)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when the token is unknown / disabled', async () => {
      await expect(svc.verifyBearer('Bearer scim_unknown')).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('throws when the token has expired', async () => {
      const { plaintext, hash } = generateScimToken();
      prisma.scimToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        organizationId: 'org_1',
        label: 'x',
        tokenHash: hash,
        tokenPrefix: 'abcd',
        enabled: true,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(svc.verifyBearer(`Bearer ${plaintext}`)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('returns the auth context for a valid token', async () => {
      const { plaintext, hash } = generateScimToken();
      prisma.scimToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        organizationId: 'org_1',
        label: 'x',
        tokenHash: hash,
        tokenPrefix: 'abcd',
        enabled: true,
        expiresAt: null,
      });
      const ctx = await svc.verifyBearer(`Bearer ${plaintext}`);
      expect(ctx).toEqual({ tokenId: 't1', organizationId: 'org_1' });
    });
  });

  describe('user lifecycle', () => {
    it('createUser provisions and writes an audit event', async () => {
      const out = await svc.createUser({
        auth: authFor(),
        tokenId: 't1',
        body: {
          id: 'u1',
          externalId: 'okta-1',
          userName: 'alice@example.com',
          emails: [{ value: 'alice@example.com', primary: true, type: 'work' }],
          name: { givenName: 'Alice' },
          active: true,
        },
      });
      expect(out.userName).toBe('alice@example.com');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(prisma.scimEvent.create).toHaveBeenCalledTimes(1);
    });

    it('getUser returns null when the user does not exist', async () => {
      expect(await svc.getUser({ auth: authFor(), id: 'missing' })).toBeNull();
    });

    it('replaceUser updates and writes an event', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'old@example.com',
        name: 'Old',
        deactivatedTime: null,
      });
      const out = await svc.replaceUser({
        auth: authFor(),
        id: 'u1',
        tokenId: 't1',
        body: {
          id: 'u1',
          externalId: 'okta-1',
          userName: 'new@example.com',
          emails: [{ value: 'new@example.com', primary: true, type: 'work' }],
          active: true,
        },
      });
      expect(out?.userName).toBe('new@example.com');
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.scimEvent.create).toHaveBeenCalledTimes(1);
    });

    it('deleteUser deactivates and writes an event', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        name: null,
        deactivatedTime: null,
      });
      expect(await svc.deleteUser({ auth: authFor(), id: 'u1', tokenId: 't1' })).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.scimEvent.create).toHaveBeenCalledTimes(1);
    });

    it('deleteUser returns false when missing', async () => {
      expect(await svc.deleteUser({ auth: authFor(), id: 'missing', tokenId: 't1' })).toBe(false);
    });
  });

  describe('listUsers', () => {
    it('paginates and applies the filter', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', email: 'a@b.com', name: 'Alice', deactivatedTime: null },
        { id: 'u2', email: 'b@b.com', name: 'Bob', deactivatedTime: null },
      ]);
      const out = await svc.listUsers({
        auth: authFor(),
        filter: 'userName eq "a@b.com"',
        startIndex: 1,
        count: 50,
      });
      expect(out.Resources).toHaveLength(1);
      expect(out.Resources[0].userName).toBe('a@b.com');
      expect(out.totalResults).toBe(1);
    });
  });

  describe('listGroups', () => {
    it('returns an empty list when there are no roles', async () => {
      const out = await svc.listGroups({ auth: authFor() });
      expect(out.Resources).toEqual([]);
    });

    it('expands member ids when roles have members', async () => {
      prisma.permissionRole.findMany.mockResolvedValueOnce([
        { id: 'g1', name: 'Engineering', members: [{ userId: 'u1' }, { userId: 'u2' }] },
      ]);
      const out = await svc.listGroups({ auth: authFor() });
      expect(out.Resources[0].members).toHaveLength(2);
    });
  });
});
