/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { IntegrationConnectorAuthService } from './integration-connector.auth.service';

interface IMockProviderTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockInstallTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockEventTable {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  integrationProvider: IMockProviderTable;
  integrationInstall: IMockInstallTable;
  integrationEventLog: IMockEventTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  integrationProvider: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  integrationInstall: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      installedTime: now,
      updatedTime: now,
      revokedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  integrationEventLog: {
    create: vi.fn(async ({ data }) => ({ ...data, receivedAt: now })),
    findMany: vi.fn(async () => []),
  },
});

describe('IntegrationConnectorAuthService (Stage 33)', () => {
  let prisma: IMockPrisma;
  let svc: IntegrationConnectorAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new IntegrationConnectorAuthService(prisma as never);
  });

  describe('ensureBundledProviders', () => {
    it('seeds the catalog when empty', async () => {
      const created = await svc.ensureBundledProviders();
      expect(created).toBeGreaterThanOrEqual(6);
    });

    it('skips existing rows', async () => {
      prisma.integrationProvider.findUnique.mockImplementation(
        async ({ where }: { where: { code: string } }) =>
          where.code === 'zapier' ? ({ id: 'prov_zapier', code: 'zapier' } as never) : null
      );
      const created = await svc.ensureBundledProviders();
      expect(created).toBe(5);
    });
  });

  describe('install', () => {
    it('installs zapier and mints a webhook secret', async () => {
      prisma.integrationProvider.findUnique.mockResolvedValueOnce({
        id: 'prov_zapier',
        code: 'zapier',
        displayName: 'Zapier',
        category: 'automation',
        authType: 'webhook-only',
        webhookStyle: 'catch-hook',
        description: null,
        docsUrl: null,
        enabled: true,
        createdTime: now,
      });
      const out = await svc.install({
        organizationId: 'o1',
        providerCode: 'zapier',
        installedBy: 'u1',
      });
      expect(out.webhookSecret).toMatch(/^whsec_[a-f0-9]{48}$/);
    });

    it('rejects bad code', async () => {
      await expect(
        svc.install({ organizationId: 'o', providerCode: 'BAD', installedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown provider', async () => {
      await expect(
        svc.install({ organizationId: 'o', providerCode: 'not-real', installedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects disabled provider', async () => {
      prisma.integrationProvider.findUnique.mockResolvedValueOnce({
        id: 'prov_x',
        code: 'x',
        displayName: 'X',
        category: 'automation',
        authType: 'webhook-only',
        webhookStyle: 'catch-hook',
        description: null,
        docsUrl: null,
        enabled: false,
        createdTime: now,
      });
      await expect(
        svc.install({ organizationId: 'o', providerCode: 'x', installedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate install', async () => {
      prisma.integrationProvider.findUnique.mockResolvedValueOnce({
        id: 'prov_zapier',
        code: 'zapier',
        displayName: 'Zapier',
        category: 'automation',
        authType: 'webhook-only',
        webhookStyle: 'catch-hook',
        description: null,
        docsUrl: null,
        enabled: true,
        createdTime: now,
      });
      prisma.integrationInstall.findUnique.mockResolvedValueOnce({ id: 'inst_old' });
      await expect(
        svc.install({ organizationId: 'o', providerCode: 'zapier', installedBy: 'u' })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update / revoke', () => {
    it('updates scopes', async () => {
      prisma.integrationInstall.findUnique.mockResolvedValueOnce({
        id: 'inst_1',
        organizationId: 'o',
        providerCode: 'zapier',
        status: 'active',
        externalAccountId: null,
        accessTokenJson: null,
        refreshToken: null,
        scopesCsv: null,
        webhookSecret: 'whsec_x',
        expiresAt: null,
        installedBy: 'u',
        installedTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const out = await svc.update('o', 'zapier', { scopesCsv: 'r,w' });
      expect(out.scopesCsv).toBe('r,w');
    });

    it('rejects invalid status transition', async () => {
      prisma.integrationInstall.findUnique.mockResolvedValueOnce({
        id: 'inst_1',
        organizationId: 'o',
        providerCode: 'zapier',
        status: 'revoked',
        externalAccountId: null,
        accessTokenJson: null,
        refreshToken: null,
        scopesCsv: null,
        webhookSecret: null,
        expiresAt: null,
        installedBy: 'u',
        installedTime: now,
        updatedTime: now,
        revokedAt: now,
      });
      await expect(svc.update('o', 'zapier', { status: 'active' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('revoke marks revokedAt', async () => {
      prisma.integrationInstall.findUnique.mockResolvedValueOnce({
        id: 'inst_1',
        organizationId: 'o',
        providerCode: 'zapier',
        status: 'active',
        externalAccountId: null,
        accessTokenJson: null,
        refreshToken: null,
        scopesCsv: null,
        webhookSecret: null,
        expiresAt: null,
        installedBy: 'u',
        installedTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const out = await svc.revoke('o', 'zapier');
      expect(out.status).toBe('revoked');
    });

    it('throws on missing install', async () => {
      await expect(svc.update('missing', 'zapier', { scopesCsv: 'r' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('events', () => {
    it('records an outbound delivery', async () => {
      const out = await svc.recordEvent({
        installId: 'inst_1',
        direction: 'outbound',
        eventType: 'row.created',
      });
      expect(out.status).toBe('delivered');
    });

    it('lists events', async () => {
      prisma.integrationEventLog.findMany.mockResolvedValueOnce([
        {
          id: 'evt_1',
          installId: 'inst_1',
          direction: 'outbound',
          eventType: 'row.created',
          payloadHash: null,
          status: 'delivered',
          attempts: 1,
          receivedAt: now,
          errorMessage: null,
        },
      ]);
      const out = await svc.listEvents({ installId: 'inst_1' });
      expect(out).toHaveLength(1);
    });
  });
});
