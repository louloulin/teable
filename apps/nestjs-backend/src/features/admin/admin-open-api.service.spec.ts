import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';
import { SettingKey } from '@teable/openapi';
import { vi } from 'vitest';
import { AuditScope } from '../audit/audit-scope';
import { DeleteUserService } from '../user/delete-user/delete-user.service';
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
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  space = {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  template = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  setting = {
    findFirst: vi.fn(),
  };
  dataDbConnection = { count: vi.fn() };
  base = { count: vi.fn() };
  collaborator = { count: vi.fn() };
  quotaHit = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  aiField = { findMany: vi.fn() };
  aiFieldRun = { findMany: vi.fn() };
  aiGenerationTask = {
    groupBy: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
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
        { provide: AuditScope, useValue: { emitAtomic: vi.fn() } },
        { provide: DeleteUserService, useValue: { deleteUserById: vi.fn() } },
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

    it('returns auto-join state and operational counts', async () => {
      prisma.space.findMany.mockResolvedValue([
        {
          id: 'space-1',
          name: 'Sales',
          createdBy: 'user-1',
          createdTime: new Date('2026-01-01T00:00:00.000Z'),
          autoJoin: true,
        },
      ]);
      prisma.space.count.mockResolvedValue(1);
      prisma.base.count.mockResolvedValue(3);
      prisma.collaborator.count.mockResolvedValue(5);

      const out = await service.listSpaces({ skip: 0, take: 100 });

      expect(out.list[0]).toMatchObject({
        id: 'space-1',
        autoJoin: true,
        baseCount: 3,
        collaboratorCount: 5,
      });
    });
  });

  describe('updateUser', () => {
    const existing = {
      id: 'user-2',
      name: 'Alice',
      email: 'alice@example.com',
      isAdmin: false,
      isSystem: false,
      deactivatedTime: null,
    };

    it('updates active state and emits an audit event', async () => {
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({
        ...existing,
        deactivatedTime: new Date('2026-01-01T00:00:00.000Z'),
        createdTime: new Date('2025-01-01T00:00:00.000Z'),
        lastSignTime: null,
      });
      const out = await service.updateUser({
        userId: 'user-2',
        requesterId: 'admin-1',
        active: false,
      });
      expect(out.deactivatedTime).toEqual(new Date('2026-01-01T00:00:00.000Z'));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deactivatedTime: expect.any(Date) } })
      );
    });

    it('rejects system users and self-modification', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...existing, isSystem: true });
      await expect(
        service.updateUser({ userId: 'user-2', requesterId: 'admin-1', active: false })
      ).rejects.toThrow('System users cannot be modified');
      prisma.user.findUnique.mockResolvedValue(existing);
      await expect(
        service.updateUser({ userId: 'user-2', requesterId: 'user-2', active: false })
      ).rejects.toThrow('current administrator');
    });

    it('prevents removing the last active administrator', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...existing, isAdmin: true });
      prisma.user.count.mockResolvedValue(0);
      await expect(
        service.updateUser({ userId: 'user-2', requesterId: 'admin-1', isAdmin: false })
      ).rejects.toThrow('last active administrator');
      expect(prisma.user.update).not.toHaveBeenCalled();
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

  describe('space management', () => {
    it('renames an active space and audits the change', async () => {
      prisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      prisma.space.update.mockResolvedValue({
        id: 'space-1',
        name: 'Renamed space',
        createdBy: 'user-1',
        createdTime: new Date('2026-01-01T00:00:00.000Z'),
        autoJoin: true,
      });

      const out = await service.updateSpace({
        spaceId: 'space-1',
        name: 'Renamed space',
        autoJoin: true,
      });

      expect(out.name).toBe('Renamed space');
      expect(out.autoJoin).toBe(true);
      expect(prisma.space.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'space-1' },
          data: { name: 'Renamed space', autoJoin: true },
        })
      );
    });

    it('soft-deletes an active space instead of deleting rows', async () => {
      prisma.space.findFirst.mockResolvedValue({ id: 'space-1' });
      prisma.space.update.mockResolvedValue({ id: 'space-1' });

      await expect(service.deleteSpace('space-1')).resolves.toEqual({
        id: 'space-1',
        deleted: true,
      });
      expect(prisma.space.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'space-1' },
          data: { deletedTime: expect.any(Date) },
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

  describe('AI generation queue', () => {
    it('returns persisted task counts and task rows', async () => {
      prisma.aiField.findMany.mockResolvedValue([]);
      prisma.aiGenerationTask.groupBy.mockResolvedValue([
        { status: 'processing', _count: { _all: 2 } },
        { status: 'completed', _count: { _all: 3 } },
      ]);
      prisma.aiGenerationTask.findMany.mockResolvedValue([{ id: 'task-1', status: 'processing' }]);
      prisma.aiFieldRun.findMany.mockResolvedValue([]);

      const out = await service.getAiGenerationQueueOverview();

      expect(out.queue).toMatchObject({ available: true, waiting: 0, processing: 2 });
      expect(out.summary.tasks).toEqual({
        waiting: 0,
        processing: 2,
        completed: 3,
        failed: 0,
        canceled: 0,
      });
      expect(out.tasks).toEqual([{ id: 'task-1', status: 'processing' }]);
    });

    it('requests cancellation only for active tasks and is idempotent', async () => {
      prisma.aiGenerationTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiGenerationTask.findUniqueOrThrow.mockResolvedValue({
        id: 'task-1',
        status: 'processing',
        cancelRequested: true,
      });

      await expect(service.cancelAiGenerationTask('task-1')).resolves.toEqual({
        id: 'task-1',
        status: 'processing',
        cancelRequested: true,
      });
      expect(prisma.aiGenerationTask.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          status: { in: ['waiting', 'processing'] },
          cancelRequested: false,
        },
        data: { cancelRequested: true },
      });
    });
  });
});
