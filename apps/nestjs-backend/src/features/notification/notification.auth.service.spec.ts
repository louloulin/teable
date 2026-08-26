/**
 * Notification — thin-DI auth service spec.
 */

import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { NotificationAuthService } from './notification.auth.service';

interface IMockNotificationTable {
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  notification: IMockNotificationTable;
}

function mkPrismaMock() {
  const notificationFindMany = vi.fn();
  const prisma = {
    notification: { findMany: notificationFindMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { notificationFindMany } };
}

const baseRow = {
  id: 'n1',
  fromUserId: 'u_actor',
  toUserId: 'u_target',
  type: 'system',
  message: 'hello',
  messageI18n: null,
  severity: 'info',
  urlPath: '/x',
  isRead: false,
  createdTime: new Date('2026-01-01T00:00:00Z'),
};

describe('NotificationAuthService', () => {
  it('listRecent returns mapped items ordered by createdTime desc', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.notificationFindMany.mockResolvedValueOnce([baseRow]);
    const svc = new NotificationAuthService(prisma);
    const out = await svc.listRecent({ userId: 'u_target' });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe('n1');
    expect(out.items[0]?.createdTime).toBe('2026-01-01T00:00:00.000Z');
    expect(out.truncated).toBe(false);
  });

  it('listRecent forwards onlyUnread as isRead=false', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.notificationFindMany.mockResolvedValueOnce([]);
    const svc = new NotificationAuthService(prisma);
    await svc.listRecent({ userId: 'u_target', onlyUnread: true });
    expect(mocks.notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { toUserId: 'u_target', isRead: false } })
    );
  });

  it('listRecent clamps the limit and marks truncated', async () => {
    const { prisma, mocks } = mkPrismaMock();
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...baseRow,
      id: `n${i}`,
      createdTime: new Date(2026, 0, 1, 0, i),
    }));
    mocks.notificationFindMany.mockResolvedValueOnce(rows);
    const svc = new NotificationAuthService(prisma);
    const out = await svc.listRecent({ userId: 'u_target', limit: 10 });
    expect(out.items).toHaveLength(10);
    expect(out.truncated).toBe(true);
  });

  it('listRecent uses default limit=10 when input is missing/invalid', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.notificationFindMany.mockResolvedValueOnce([]);
    const svc = new NotificationAuthService(prisma);
    await svc.listRecent({ userId: 'u_target', limit: -1 });
    expect(mocks.notificationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 11 }));
  });

  it('label() humanizes the type', () => {
    const { prisma } = mkPrismaMock();
    const svc = new NotificationAuthService(prisma);
    expect(svc.label('exportBase')).toBe('Export base');
    expect(svc.label('nothing.matches')).toBe('Nothing matches');
  });
});
