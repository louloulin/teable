/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { SdkPlatformAuthService } from './sdk-platform.auth.service';

interface IMockAppTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockTokenTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockUsageTable {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockReleaseTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  sdkApp: IMockAppTable;
  sdkToken: IMockTokenTable;
  sdkUsageLog: IMockUsageTable;
  sdkRelease: IMockReleaseTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  sdkApp: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      enabled: true,
      clientSecretHash: null,
      createdTime: now,
      updatedTime: now,
      revokedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  sdkToken: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      status: 'active',
      createdTime: now,
      lastUsedAt: null,
      revokedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  sdkUsageLog: {
    create: vi.fn(async ({ data }) => ({ ...data, occurredAt: now })),
    findMany: vi.fn(async () => []),
  },
  sdkRelease: {
    create: vi.fn(async ({ data }) => ({ ...data, publishedAt: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
});

describe('SdkPlatformAuthService (Stage 38)', () => {
  let prisma: IMockPrisma;
  let svc: SdkPlatformAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new SdkPlatformAuthService(prisma as never);
  });

  describe('registerApp', () => {
    it('creates app with generated clientId', async () => {
      const app = await svc.registerApp({
        organizationId: 'o',
        name: 'MyApp',
        language: 'js',
        scopesCsv: 'r,w',
        createdBy: 'u',
      });
      expect(app.clientId).toMatch(/^[0-9A-Z]{16}$/);
      expect(app.enabled).toBe(true);
    });

    it('rejects invalid language', async () => {
      await expect(
        svc.registerApp({
          organizationId: 'o',
          name: 'x',
          language: 'kotlin' as never,
          scopesCsv: 'r',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects empty scopes', async () => {
      await expect(
        svc.registerApp({
          organizationId: 'o',
          name: 'x',
          language: 'js',
          scopesCsv: '   ',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rotateClientSecret / verifyClientCredentials', () => {
    it('rotate returns plaintext + hash', async () => {
      prisma.sdkApp.findUnique.mockResolvedValueOnce({
        id: 'a',
        organizationId: 'o',
        name: 'X',
        language: 'js',
        homepageUrl: null,
        redirectUrl: null,
        scopesCsv: 'r',
        clientId: 'CID',
        clientSecretHash: null,
        description: null,
        enabled: true,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const r = await svc.rotateClientSecret('a');
      expect(r.plaintext).toMatch(/^sdk_sk_/);
      expect(r.app.clientSecretHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('verifyClientCredentials matches hash', async () => {
      const secret = 'sdk_sk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const { hashSecret } = await import('./sdk-platform.service');
      prisma.sdkApp.findUnique.mockResolvedValueOnce({
        id: 'a',
        organizationId: 'o',
        name: 'X',
        language: 'js',
        homepageUrl: null,
        redirectUrl: null,
        scopesCsv: 'r',
        clientId: 'CID',
        clientSecretHash: hashSecret(secret),
        description: null,
        enabled: true,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const app = await svc.verifyClientCredentials({ clientId: 'CID', clientSecret: secret });
      expect(app?.id).toBe('a');
    });

    it('verifyClientCredentials rejects wrong secret', async () => {
      const { hashSecret } = await import('./sdk-platform.service');
      prisma.sdkApp.findUnique.mockResolvedValueOnce({
        id: 'a',
        organizationId: 'o',
        name: 'X',
        language: 'js',
        homepageUrl: null,
        redirectUrl: null,
        scopesCsv: 'r',
        clientId: 'CID',
        clientSecretHash: hashSecret('sdk_sk_correct_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        description: null,
        enabled: true,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const app = await svc.verifyClientCredentials({
        clientId: 'CID',
        clientSecret: 'sdk_sk_wrong_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(app).toBeNull();
    });

    it('rotate throws on missing app', async () => {
      await expect(svc.rotateClientSecret('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('mintToken / resolveToken / revokeToken', () => {
    it('mints a token with plaintext reveal', async () => {
      prisma.sdkApp.findUnique.mockResolvedValueOnce({
        id: 'a',
        organizationId: 'o',
        name: 'X',
        language: 'js',
        homepageUrl: null,
        redirectUrl: null,
        scopesCsv: 'r',
        clientId: 'CID',
        clientSecretHash: null,
        description: null,
        enabled: true,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const t = await svc.mintToken({
        appId: 'a',
        organizationId: 'o',
        label: 'prod',
        scopesCsv: 'r,w',
        createdBy: 'u',
      });
      expect(t.plaintext).toMatch(/^tblk_/);
      expect(t.status).toBe('active');
    });

    it('rejects mint on disabled app', async () => {
      prisma.sdkApp.findUnique.mockResolvedValueOnce({
        id: 'a',
        organizationId: 'o',
        name: 'X',
        language: 'js',
        homepageUrl: null,
        redirectUrl: null,
        scopesCsv: 'r',
        clientId: 'CID',
        clientSecretHash: null,
        description: null,
        enabled: false,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      await expect(
        svc.mintToken({
          appId: 'a',
          organizationId: 'o',
          label: 'x',
          scopesCsv: 'r',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects mint on missing app', async () => {
      await expect(
        svc.mintToken({
          appId: 'missing',
          organizationId: 'o',
          label: 'x',
          scopesCsv: 'r',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolveToken returns null for unknown', async () => {
      expect(await svc.resolveToken('tblk_notreal')).toBeNull();
    });

    it('resolveToken returns null for non-prefixed', async () => {
      expect(await svc.resolveToken('notatoken')).toBeNull();
    });

    it('revokeToken throws on missing', async () => {
      await expect(svc.revokeToken('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokeToken blocks invalid transition', async () => {
      prisma.sdkToken.findUnique.mockResolvedValueOnce({
        id: 't',
        appId: 'a',
        organizationId: 'o',
        userId: null,
        label: 'x',
        tokenHash: 'h',
        tokenLastFour: 'abcd',
        scopesCsv: 'r',
        status: 'revoked',
        createdBy: 'u',
        createdTime: now,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: now,
      });
      await expect(svc.revokeToken('t')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('revokeToken flips active → revoked', async () => {
      prisma.sdkToken.findUnique.mockResolvedValueOnce({
        id: 't',
        appId: 'a',
        organizationId: 'o',
        userId: null,
        label: 'x',
        tokenHash: 'h',
        tokenLastFour: 'abcd',
        scopesCsv: 'r',
        status: 'active',
        createdBy: 'u',
        createdTime: now,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      });
      const out = await svc.revokeToken('t');
      expect(out.status).toBe('revoked');
    });
  });

  describe('recordUsage', () => {
    it('records + rejects invalid outcome', async () => {
      const out = await svc.recordUsage({
        appId: 'a',
        method: 'GET',
        path: '/x',
        statusCode: 200,
        durationMs: 10,
        outcome: 'ok',
      });
      expect(out.outcome).toBe('ok');
      await expect(
        svc.recordUsage({
          appId: 'a',
          method: 'GET',
          path: '/x',
          statusCode: 200,
          durationMs: 0,
          outcome: 'bogus' as never,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('publishRelease / listReleases', () => {
    it('publishes + rejects duplicate', async () => {
      const r = await svc.publishRelease({ language: 'js', version: '1.0.0', changelog: 'init' });
      expect(r.channel).toBe('stable');
      prisma.sdkRelease.findUnique.mockResolvedValueOnce({ id: 'dup' });
      await expect(svc.publishRelease({ language: 'js', version: '1.0.0' })).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it('rejects invalid language', async () => {
      await expect(
        svc.publishRelease({ language: 'kotlin' as never, version: '1.0.0' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid version', async () => {
      await expect(svc.publishRelease({ language: 'js', version: '1.2' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('latestRelease returns first row', async () => {
      prisma.sdkRelease.findMany.mockResolvedValueOnce([
        {
          id: 'r',
          language: 'js',
          version: '1.0.0',
          changelog: null,
          artifactUrl: null,
          publishedAt: now,
          channel: 'stable',
        },
      ]);
      const out = await svc.latestRelease('js', 'stable');
      expect(out?.version).toBe('1.0.0');
    });
  });
});
