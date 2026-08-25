import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  advanceDelivery,
  buildPayload,
  endpointAcceptsEvent,
  isTerminalStatus,
  isValidUrl,
  newDeliveryId,
  pickDueDeliveries,
  signBody,
  toRow,
} from './webhook-delivery.service';
import type {
  IDispatchResult,
  IWebhookDelivery,
  IWebhookEndpoint,
  IWebhookPayload,
} from './webhook-delivery.types';
import { DEFAULT_MAX_ATTEMPTS, IWebhookDispatcher } from './webhook-delivery.types';

@Injectable()
export class WebhookDeliveryAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: IWebhookDispatcher
  ) {}

  async enqueue(args: {
    endpointId: string;
    event: string;
    body: string;
    now?: Date;
  }): Promise<IWebhookDelivery> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: args.endpointId },
    });
    if (!endpoint) throw new Error('endpoint not found');
    if (!endpoint.enabled) throw new Error('endpoint disabled');
    if (!endpointAcceptsEvent(toEndpoint(endpoint), args.event)) {
      throw new Error('endpoint does not accept event');
    }
    const payload = buildPayload({ event: args.event, body: args.body });
    await this.prisma.webhookPayload.create({
      data: {
        id: payload.id,
        event: payload.event,
        body: payload.body,
        createdTime: payload.createdTime,
      },
    });
    const delivery: IWebhookDelivery = {
      id: newDeliveryId(),
      endpointId: endpoint.id,
      payloadId: payload.id,
      status: 'pending',
      attempt: 0,
      maxAttempts: endpoint.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: args.now ?? new Date(),
      createdTime: new Date(),
    };
    await this.prisma.webhookDelivery.create({ data: toRow(delivery) });
    return delivery;
  }

  async listDue(now: Date = new Date()): Promise<IWebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany();
    return pickDueDeliveries(rows.map(toDelivery), now);
  }

  async dispatchOne(args: { delivery: IWebhookDelivery; now?: Date }): Promise<IDispatchResult> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: args.delivery.endpointId },
    });
    if (!endpoint) throw new Error('endpoint missing');
    const payloadRow = await this.prisma.webhookPayload.findUnique({
      where: { id: args.delivery.payloadId },
    });
    if (!payloadRow) throw new Error('payload missing');
    const payload: IWebhookPayload = {
      id: payloadRow.id,
      event: payloadRow.event,
      body: payloadRow.body,
      createdTime: payloadRow.createdTime,
    };
    const { next } = await advanceDelivery({
      delivery: args.delivery,
      endpoint: toEndpoint(endpoint),
      payload,
      dispatcher: this.dispatcher,
      now: args.now,
    });
    await this.prisma.webhookDelivery.update({
      where: { id: next.id },
      data: toRow(next),
    });
    return {
      deliveryId: next.id,
      status: next.status,
      attempt: next.attempt,
      nextAttemptAt: isTerminalStatus(next.status) ? undefined : next.nextAttemptAt,
      lastStatusCode: next.lastStatusCode,
      lastError: next.lastError,
    };
  }

  async listDead(): Promise<IWebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({ where: { status: 'dead' } });
    return rows.map(toDelivery);
  }

  async retryDead(deliveryId: string): Promise<IWebhookDelivery> {
    const row = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!row) throw new Error('not found');
    if (row.status !== 'dead') throw new Error('not in dead-letter');
    const next: IWebhookDelivery = toDelivery({
      ...row,
      status: 'pending',
      nextAttemptAt: new Date(),
    });
    await this.prisma.webhookDelivery.update({ where: { id: next.id }, data: toRow(next) });
    return next;
  }

  async deleteDelivery(deliveryId: string): Promise<void> {
    await this.prisma.webhookDelivery.delete({ where: { id: deliveryId } });
  }

  isValidUrl = isValidUrl;
  signBody = signBody;
  isTerminalStatus = isTerminalStatus;
}

function toEndpoint(row: {
  id: string;
  url: string;
  secret: string;
  events: ReadonlyArray<string>;
  maxAttempts: number;
  enabled: boolean;
  createdTime: Date;
  headers: Record<string, string> | null;
}): IWebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    headers: row.headers ?? {},
    events: row.events,
    maxAttempts: row.maxAttempts,
    enabled: row.enabled,
    createdTime: row.createdTime,
  };
}

function toDelivery(row: {
  id: string;
  endpointId: string;
  payloadId: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
  finalizedAt: Date | null;
  deliveredAt: Date | null;
  createdTime: Date;
}): IWebhookDelivery {
  return {
    id: row.id,
    endpointId: row.endpointId,
    payloadId: row.payloadId,
    status: row.status as IWebhookDelivery['status'],
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lastStatusCode: row.lastStatusCode ?? undefined,
    lastError: row.lastError ?? undefined,
    lastAttemptAt: row.lastAttemptAt ?? undefined,
    finalizedAt: row.finalizedAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    createdTime: row.createdTime,
  };
}
