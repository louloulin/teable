/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatWritePlanService } from './ai-chat-write-plan.service';

const now = new Date('2026-09-02T00:00:00.000Z');

function buildPrisma() {
  return {
    aiChatSession: { findFirst: vi.fn() },
    aiChatWritePlan: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tableMeta: { findFirst: vi.fn() },
  };
}

describe('AiChatWritePlanService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let permissionService: { validPermissions: ReturnType<typeof vi.fn> };
  let recordOpenApiService: {
    multipleCreateRecords: ReturnType<typeof vi.fn>;
    updateRecords: ReturnType<typeof vi.fn>;
  };
  let service: AiChatWritePlanService;

  beforeEach(() => {
    prisma = buildPrisma();
    permissionService = { validPermissions: vi.fn().mockResolvedValue([]) };
    recordOpenApiService = {
      multipleCreateRecords: vi.fn().mockResolvedValue({ records: [{ id: 'rec1' }] }),
      updateRecords: vi.fn().mockResolvedValue({ records: [{ id: 'rec1' }] }),
    };
    service = new AiChatWritePlanService(
      prisma as never,
      permissionService as never,
      recordOpenApiService as never
    );
    prisma.aiChatSession.findFirst.mockResolvedValue({
      id: 'session1',
      baseId: 'base1',
      createdBy: 'user1',
    });
    prisma.tableMeta.findFirst.mockResolvedValue({ id: 'table1' });
    prisma.aiChatWritePlan.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      createdTime: now,
      updatedTime: now,
      confirmedBy: null,
      confirmedTime: null,
      executedTime: null,
      result: null,
      errorMessage: null,
    }));
  });

  it('creates a pending plan without writing records', async () => {
    const result = await service.create({
      sessionId: 'session1',
      userId: 'user1',
      tableId: 'table1',
      operation: 'record_create',
      summary: '创建一条记录',
      records: [{ fields: { Name: 'Ada' } }],
    });
    expect(result.status).toBe('pending');
    expect(recordOpenApiService.multipleCreateRecords).not.toHaveBeenCalled();
    expect(permissionService.validPermissions).toHaveBeenCalledWith('table1', ['record|create']);
  });

  it('rejects a plan for another user', async () => {
    prisma.aiChatSession.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create({
        sessionId: 'session1',
        userId: 'other',
        tableId: 'table1',
        operation: 'record_create',
        summary: 'x',
        records: [{ fields: {} }],
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires explicit confirmation before executing', async () => {
    const plan = {
      id: 'plan1',
      sessionId: 'session1',
      userId: 'user1',
      baseId: 'base1',
      tableId: 'table1',
      operation: 'record_create',
      payload: { fieldKeyType: 'name', typecast: false, records: [{ fields: { Name: 'Ada' } }] },
      summary: 'create',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    };
    prisma.aiChatWritePlan.findFirst.mockResolvedValue(plan);
    prisma.aiChatWritePlan.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiChatWritePlan.update.mockImplementation(async ({ data }: any) => ({
      ...plan,
      ...data,
    }));
    await service.confirm('plan1', 'user1');
    expect(recordOpenApiService.multipleCreateRecords).toHaveBeenCalledTimes(1);
    expect(prisma.aiChatWritePlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'pending' }) })
    );
  });

  it('does not execute an expired plan', async () => {
    prisma.aiChatWritePlan.findFirst.mockResolvedValue({
      id: 'plan1',
      sessionId: 'session1',
      userId: 'user1',
      baseId: 'base1',
      tableId: 'table1',
      operation: 'record_create',
      payload: { records: [{ fields: {} }] },
      status: 'pending',
      expiresAt: new Date(now.getTime() - 1),
    });
    await expect(service.confirm('plan1', 'user1')).rejects.toBeInstanceOf(BadRequestException);
    expect(recordOpenApiService.multipleCreateRecords).not.toHaveBeenCalled();
  });

  it('does not execute when the atomic claim loses a race', async () => {
    prisma.aiChatWritePlan.findFirst.mockResolvedValue({
      id: 'plan1',
      sessionId: 'session1',
      userId: 'user1',
      baseId: 'base1',
      tableId: 'table1',
      operation: 'record_update',
      payload: { records: [{ id: 'rec1', fields: { Name: 'Grace' } }] },
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.aiChatWritePlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirm('plan1', 'user1')).rejects.toBeInstanceOf(BadRequestException);
    expect(recordOpenApiService.updateRecords).not.toHaveBeenCalled();
  });

  it('does not confirm a plan from another Cuppy conversation', async () => {
    prisma.aiChatWritePlan.findFirst.mockResolvedValue({
      id: 'plan1',
      sessionId: 'aics_cuppy_conv-a',
      userId: 'user1',
      baseId: 'base1',
      tableId: 'table1',
      operation: 'record_create',
      payload: { records: [{ fields: {} }] },
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.confirmForCuppy('plan1', 'conv-b', 'user1')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.aiChatWritePlan.updateMany).not.toHaveBeenCalled();
    expect(recordOpenApiService.multipleCreateRecords).not.toHaveBeenCalled();
  });
});
