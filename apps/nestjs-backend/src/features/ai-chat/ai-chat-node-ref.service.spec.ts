import { describe, expect, it, vi } from 'vitest';
import { AiChatNodeRefService } from './ai-chat-node-ref.service';

function createService() {
  const session = {
    id: 'session-1',
    baseId: 'base-1',
    createdBy: 'user-1',
  };
  const prisma = {
    aiChatSession: { findUnique: vi.fn(async () => session) },
    aiChatNodeRef: {
      findMany: vi.fn(async () => [
        {
          id: 'node-1',
          sessionId: 'session-1',
          kind: 'table',
          refId: 'table-1',
          label: '客户',
          createdBy: 'user-1',
          createdTime: new Date(),
        },
      ]),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    tableMeta: {
      findFirst: vi.fn(async () => ({ id: 'table-1', name: '客户' })),
    },
  };
  const permissions = {
    validPermissions: vi.fn(async () => []),
  };
  return {
    service: new AiChatNodeRefService(prisma as never, permissions as never),
    prisma,
    permissions,
  };
}

describe('AiChatNodeRefService', () => {
  it('canonicalizes and persists a permission-checked table reference', async () => {
    const { service, prisma, permissions } = createService();
    const result = await service.add({
      sessionId: 'session-1',
      userId: 'user-1',
      kind: 'table',
      refId: 'table-1',
    });

    expect(result.label).toBe('客户');
    expect(prisma.aiChatNodeRef.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId_kind_refId: { sessionId: 'session-1', kind: 'table', refId: 'table-1' } },
      })
    );
    expect(permissions.validPermissions).toHaveBeenCalledWith('table-1', ['table|read']);
  });

  it('removes references that fail the latest authorization check', async () => {
    const { service, prisma, permissions } = createService();
    permissions.validPermissions.mockImplementation(async (resourceId: string) => {
      if (resourceId === 'table-1') throw new Error('revoked');
      return [];
    });

    const result = await service.refresh('session-1', 'user-1');

    expect(result).toEqual([]);
    expect(prisma.aiChatNodeRef.deleteMany).toHaveBeenCalledWith({
      where: { id: 'node-1', sessionId: 'session-1' },
    });
  });
});
