/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { NotificationCenterAuthService } from './notification-center.auth.service';

interface IMockNotif {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}
interface IMockDeliv {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockPref {
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  notification: IMockNotif;
  notificationDelivery: IMockDeliv;
  notificationPreference: IMockPref;
}

const buildPrisma = (): IMockPrisma => ({
  notification: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: new Date() })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  notificationDelivery: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  notificationPreference: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async ({ where, create, update }) => ({
      userId: where.userId,
      ...create,
      ...update,
    })),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new NotificationCenterAuthService(prisma as never);
  return { svc, prisma };
};

describe('NotificationCenterAuthService (Stage 45)', () => {
  it('createAndDispatch persists notification and deliveries', async () => {
    const { svc, prisma } = buildSvc();
    const out = await svc.createAndDispatch({
      baseId: 'b',
      recipientUserId: 'u',
      kind: 'mention',
      title: 'hello',
      body: 'world',
    });
    expect(out.notification.kind).toBe('mention');
    expect(out.deliveries.length).toBeGreaterThanOrEqual(1);
    expect(out.deliveries.some((d) => d.channel === 'in-app')).toBe(true);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalled();
  });

  it('createAndDispatch rejects invalid kind', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createAndDispatch({
        baseId: 'b',
        recipientUserId: 'u',
        kind: 'nope' as never,
        title: 't',
        body: 'b',
      })
    ).rejects.toThrow();
  });

  it('markChannelDelivered persists sent state', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notificationDelivery.findUnique.mockResolvedValueOnce({
      id: 'd1',
      notificationId: 'n1',
      channel: 'email',
      status: 'pending',
      attempts: 0,
      lastError: null,
      sentAt: null,
    } as never);
    const r = await svc.markChannelDelivered('d1');
    expect(r.status).toBe('sent');
    expect(r.attempts).toBe(1);
  });

  it('markChannelDelivered throws on unknown id', async () => {
    const { svc } = buildSvc();
    await expect(svc.markChannelDelivered('ghost')).rejects.toThrow(/not found/);
  });

  it('markChannelFailed records error', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notificationDelivery.findUnique.mockResolvedValueOnce({
      id: 'd1',
      notificationId: 'n1',
      channel: 'email',
      status: 'pending',
      attempts: 0,
      lastError: null,
      sentAt: null,
    } as never);
    const r = await svc.markChannelFailed('d1', 'SMTP 421');
    expect(r.status).toBe('failed');
    expect(r.lastError).toBe('SMTP 421');
  });

  it('markChannelSkipped marks delivery skipped', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notificationDelivery.findUnique.mockResolvedValueOnce({
      id: 'd1',
      notificationId: 'n1',
      channel: 'email',
      status: 'pending',
      attempts: 0,
      lastError: null,
      sentAt: null,
    } as never);
    const r = await svc.markChannelSkipped('d1');
    expect(r.status).toBe('skipped');
  });

  it('list filters by userId', async () => {
    const { svc, prisma } = buildSvc();
    await svc.list({ userId: 'u1' });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: 'u1' },
      })
    );
  });

  it('list with unreadOnly adds readAt filter', async () => {
    const { svc, prisma } = buildSvc();
    await svc.list({ userId: 'u1', unreadOnly: true });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: 'u1', readAt: null },
      })
    );
  });

  it('unreadCount returns count', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notification.findMany.mockResolvedValueOnce([{}, {}] as never);
    expect(await svc.unreadCount('u1')).toBe(2);
  });

  it('markAsRead sets readAt', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notification.findUnique.mockResolvedValueOnce({
      id: 'n1',
      baseId: 'b',
      recipientUserId: 'u',
      kind: 'mention',
      title: 't',
      body: 'b',
      link: null,
      sourceId: null,
      readAt: null,
      createdTime: new Date(),
    } as never);
    const r = await svc.markAsRead('n1');
    expect(r.readAt).toBeInstanceOf(Date);
  });

  it('markAsRead throws on missing notification', async () => {
    const { svc } = buildSvc();
    await expect(svc.markAsRead('ghost')).rejects.toThrow(/not found/);
  });

  it('markAllRead updates many rows', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 3 } as never);
    expect(await svc.markAllRead('u1')).toBe(3);
  });

  it('listDeliveries returns all deliveries', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notificationDelivery.findMany.mockResolvedValueOnce([
      { id: 'd1', notificationId: 'n1', channel: 'email', status: 'sent', attempts: 1 },
    ] as never);
    const out = await svc.listDeliveries('n1');
    expect(out).toHaveLength(1);
  });

  it('getPreferences returns defaults when none stored', async () => {
    const { svc } = buildSvc();
    const p = await svc.getPreferences('u1');
    expect(p.userId).toBe('u1');
    expect(p.channels.mention).toContain('in-app');
  });

  it('getPreferences reads stored JSON channels', async () => {
    const { svc, prisma } = buildSvc();
    prisma.notificationPreference.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      channelsJson: JSON.stringify({
        mention: ['in-app'],
        'comment-reply': ['in-app'],
        'automation-run': ['in-app'],
        'approval-request': ['in-app'],
        'approval-decision': ['in-app'],
        system: ['in-app'],
      }),
      quietHoursStart: 22,
      quietHoursEnd: 6,
    } as never);
    const p = await svc.getPreferences('u1');
    expect(p.quietHoursStart).toBe(22);
    expect(p.quietHoursEnd).toBe(6);
  });

  it('setPreferences persists channelsJson', async () => {
    const { svc, prisma } = buildSvc();
    await svc.setPreferences({
      userId: 'u1',
      channels: {
        mention: ['in-app', 'email'],
        'comment-reply': ['in-app'],
        'automation-run': ['in-app'],
        'approval-request': ['in-app'],
        'approval-decision': ['in-app'],
        system: ['in-app'],
      },
    });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledTimes(1);
  });

  it('setPreferences rejects invalid channel', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.setPreferences({
        userId: 'u1',
        channels: {
          mention: ['sms' as never],
          'comment-reply': ['in-app'],
          'automation-run': ['in-app'],
          'approval-request': ['in-app'],
          'approval-decision': ['in-app'],
          system: ['in-app'],
        },
      })
    ).rejects.toThrow();
  });
});
