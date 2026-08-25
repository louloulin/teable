import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildDelivery,
  buildNotification,
  countUnread,
  defaultPreferences,
  isValidChannel,
  isValidKind,
  markDeliveryFailed,
  markDeliverySent,
  markDeliverySkipped,
  markRead,
  resolveChannels,
  validateCreateInput,
  validatePreferences,
} from './notification-center.service';
import type {
  DeliveryStatus,
  ICreateNotificationInput,
  INotification,
  INotificationDelivery,
  INotificationDispatchResult,
  INotificationPreference,
  NotificationChannel,
  NotificationKind,
} from './notification-center.types';

@Injectable()
export class NotificationCenterAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createAndDispatch(
    input: ICreateNotificationInput,
    options: { preferences?: INotificationPreference; nowHour?: number } = {}
  ): Promise<INotificationDispatchResult> {
    validateCreateInput(input);
    const id = `nt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildNotification(id, input);
    const created = await this.prisma.notification.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        recipientUserId: row.recipientUserId,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link ?? null,
        sourceId: row.sourceId ?? null,
        readAt: null,
      },
    });
    const pref = options.preferences ?? defaultPreferences(input.recipientUserId);
    const hour = options.nowHour ?? new Date().getUTCHours();
    const channels = resolveChannels(pref, input.kind, hour);
    const deliveries: INotificationDelivery[] = [];
    for (const ch of channels) {
      const dId = `nd_${row.id}_${ch}`;
      const d = buildDelivery(dId, row.id, ch);
      const isInApp = ch === 'in-app';
      const written = await this.prisma.notificationDelivery.create({
        data: {
          id: d.id,
          notificationId: d.notificationId,
          channel: d.channel,
          status: isInApp ? 'sent' : 'pending',
          attempts: isInApp ? 1 : 0,
          sentAt: isInApp ? new Date() : null,
        },
      });
      deliveries.push(toDelivery(written));
    }
    return { notification: toNotification(created), deliveries };
  }

  async markChannelDelivered(deliveryId: string): Promise<INotificationDelivery> {
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!existing) throw new NotFoundException(`delivery not found: ${deliveryId}`);
    const folded = markDeliverySent(toDelivery(existing));
    const updated = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: folded.status,
        attempts: folded.attempts,
        sentAt: folded.sentAt,
      },
    });
    return toDelivery(updated);
  }

  async markChannelFailed(deliveryId: string, error: string): Promise<INotificationDelivery> {
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!existing) throw new NotFoundException(`delivery not found: ${deliveryId}`);
    const folded = markDeliveryFailed(toDelivery(existing), error);
    const updated = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: folded.status,
        attempts: folded.attempts,
        lastError: folded.lastError ?? null,
      },
    });
    return toDelivery(updated);
  }

  async markChannelSkipped(deliveryId: string): Promise<INotificationDelivery> {
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!existing) throw new NotFoundException(`delivery not found: ${deliveryId}`);
    const folded = markDeliverySkipped(toDelivery(existing));
    const updated = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: folded.status },
    });
    return toDelivery(updated);
  }

  async list(input: {
    userId: string;
    baseId?: string;
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<INotification[]> {
    const limit = input.limit ?? 50;
    const where: Record<string, unknown> = { recipientUserId: input.userId };
    if (input.baseId) where['baseId'] = input.baseId;
    if (input.unreadOnly) where['readAt'] = null;
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdTime: 'desc' },
      take: limit,
    });
    return rows.map(toNotification);
  }

  async unreadCount(userId: string): Promise<number> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientUserId: userId, readAt: null },
    });
    return countUnread(rows.map(toNotification));
  }

  async markAsRead(notificationId: string): Promise<INotification> {
    const existing = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!existing) throw new NotFoundException(`notification not found: ${notificationId}`);
    const folded = markRead(toNotification(existing));
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: folded.readAt },
    });
    return toNotification(updated);
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  async listDeliveries(notificationId: string): Promise<INotificationDelivery[]> {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { notificationId },
    });
    return rows.map(toDelivery);
  }

  async getPreferences(userId: string): Promise<INotificationPreference> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!row) return defaultPreferences(userId);
    return {
      userId: row.userId,
      channels: JSON.parse(row.channelsJson) as Record<NotificationKind, NotificationChannel[]>,
      quietHoursStart: row.quietHoursStart ?? undefined,
      quietHoursEnd: row.quietHoursEnd ?? undefined,
    };
  }

  async setPreferences(pref: INotificationPreference): Promise<INotificationPreference> {
    validatePreferences(pref);
    for (const [, list] of Object.entries(pref.channels)) {
      for (const ch of list) {
        if (!isValidChannel(ch)) throw new BadRequestException(`invalid channel: ${ch}`);
      }
    }
    await this.prisma.notificationPreference.upsert({
      where: { userId: pref.userId },
      create: {
        userId: pref.userId,
        channelsJson: JSON.stringify(pref.channels),
        quietHoursStart: pref.quietHoursStart ?? null,
        quietHoursEnd: pref.quietHoursEnd ?? null,
      },
      update: {
        channelsJson: JSON.stringify(pref.channels),
        quietHoursStart: pref.quietHoursStart ?? null,
        quietHoursEnd: pref.quietHoursEnd ?? null,
      },
    });
    return this.getPreferences(pref.userId);
  }

  isValidKind = isValidKind;
  isValidChannel = isValidChannel;
}

function toNotification(r: {
  id: string;
  baseId: string;
  recipientUserId: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  sourceId: string | null;
  readAt: Date | null;
  createdTime: Date;
}): INotification {
  return {
    id: r.id,
    baseId: r.baseId,
    recipientUserId: r.recipientUserId,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    link: r.link ?? undefined,
    sourceId: r.sourceId ?? undefined,
    readAt: r.readAt,
    createdTime: r.createdTime,
  };
}

function toDelivery(r: {
  id: string;
  notificationId: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
}): INotificationDelivery {
  return {
    id: r.id,
    notificationId: r.notificationId,
    channel: r.channel as NotificationChannel,
    status: r.status as DeliveryStatus,
    attempts: r.attempts,
    lastError: r.lastError ?? undefined,
    sentAt: r.sentAt ?? undefined,
  };
}
