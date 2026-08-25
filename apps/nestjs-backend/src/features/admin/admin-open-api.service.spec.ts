import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';
import { SettingKey } from '@teable/openapi';
import { vi } from 'vitest';
import { AdminOpenApiService } from './admin-open-api.service';

/**
 * Service-level tests verify the Prisma WHERE / ORDER BY / pagination
 * shapes that the admin panel depends on. They use a hand-rolled fake
 * Prisma (mirroring the `quota.service.spec.ts` pattern) so we can
 * assert `findMany` is called with the exact `where` / `skip` / `take`
 * combinations.
 */
class FakePrisma {
  user = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  space = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  template = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  setting = {
    findFirst: vi.fn(),
  };
  quotaHit = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
}

describe('AdminOpenApiService', () => {
  let service: AdminOpenApiService;
  let prisma: FakePrisma;

  beforeEach(async () => {
    prisma = new FakePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOpenApiService,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
      ],
    }).compile();
    service = module.get(AdminOpenApiService);
  });

  describe('listUsers', () => {
    it('returns an empty list and zero total when nothing matches', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      const out = await service.listUsers({ skip: 0, take: 100 });
      expect(out).toEqual({ list: [], total: 0, skip: 0, take: 100 });
    });

    it('forwards skip / take to Prisma and orders by createdTime desc', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      await service.listUsers({ skip: 10, take: 5 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { permanentDeletedTime: null },
          skip: 10,
          take: 5,
          orderBy: { createdTime: 'desc' },
        })
      );
    });

    it('builds a case-insensitive OR search across name and email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      await service.listUsers({ skip: 0, take: 25, search: 'alice' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            permanentDeletedTime: null,
            OR: [
              { name: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
            ],
          },
          skip: 0,
          take: 25,
        })
      );
    });

    it('never selects sensitive columns (password / salt / refMeta)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      await service.listUsers({ skip: 0, take: 10 });
      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.select).toBeDefined();
      const keys = Object.keys(call.select);
      expect(keys).not.toContain('password');
      expect(keys).not.toContain('salt');
      expect(keys).not.toContain('refMeta');
    });
  });

  describe('listSpaces', () => {
    it('returns empty result without invoking soft-deleted rows', async () => {
      prisma.space.findMany.mockResolvedValue([]);
      prisma.space.count.mockResolvedValue(0);
      const out = await service.listSpaces({ skip: 0, take: 100 });
      expect(out).toEqual({ list: [], total: 0, skip: 0, take: 100 });
      expect(prisma.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedTime: null },
          skip: 0,
          take: 100,
        })
      );
    });
  });

  describe('listPublishedTemplates', () => {
    it('filters by isPublished = true and orders by order asc', async () => {
      prisma.template.findMany.mockResolvedValue([]);
      prisma.template.count.mockResolvedValue(0);
      await service.listPublishedTemplates({ skip: 0, take: 100 });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          skip: 0,
          take: 100,
        })
      );
    });
  });

  describe('getAiSettings', () => {
    it('parses JSON content into aiConfig', async () => {
      prisma.setting.findFirst.mockResolvedValue({
        content: JSON.stringify({ llmProviders: [], chatModel: 'gpt-4o' }),
      });
      const out = await service.getAiSettings();
      expect(out).toEqual({
        aiConfig: { llmProviders: [], chatModel: 'gpt-4o' },
      });
      expect(prisma.setting.findFirst).toHaveBeenCalledWith({
        where: { name: SettingKey.AI_CONFIG },
        select: { content: true },
      });
    });

    it('returns null aiConfig when no row exists', async () => {
      prisma.setting.findFirst.mockResolvedValue(null);
      const out = await service.getAiSettings();
      expect(out).toEqual({ aiConfig: null });
    });

    it('falls back to raw string when content is not JSON-parseable', async () => {
      prisma.setting.findFirst.mockResolvedValue({ content: 'not-json' });
      const out = await service.getAiSettings();
      expect(out).toEqual({ aiConfig: 'not-json' });
    });
  });

  describe('getQuotaDashboard', () => {
    it('returns empty list / zero total and orders by createdTime desc', async () => {
      prisma.quotaHit.findMany.mockResolvedValue([]);
      prisma.quotaHit.count.mockResolvedValue(0);
      const out = await service.getQuotaDashboard({ skip: 0, take: 50 });
      expect(out).toEqual({ list: [], total: 0, skip: 0, take: 50 });
      expect(prisma.quotaHit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdTime: 'desc' },
          skip: 0,
          take: 50,
        })
      );
    });

    it('forwards skip / take to Prisma', async () => {
      prisma.quotaHit.findMany.mockResolvedValue([]);
      prisma.quotaHit.count.mockResolvedValue(0);
      await service.getQuotaDashboard({ skip: 5, take: 20 });
      expect(prisma.quotaHit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 20 })
      );
    });
  });
});
