/* eslint-disable @typescript-eslint/naming-convention */
/**
 * SCIM Push provisioning — NestJS auth service (Stage 67).
 *
 * Owns subscriptions, events, and the delivery ledger. The
 * `dispatchEvent()` entry point records the event, fans out to every
 * matching subscription, and persists one delivery row per match.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildRequest,
  canRegisterMore,
  computeBackoff,
  normalizeSubscription,
  recordAttempt,
  shouldDeliver,
  validateSubscription,
} from './scim-push.service';
import type {
  IScimPushDelivery,
  IScimPushDeliveryAttempt,
  IScimPushEvent,
  IScimPushOptions,
  IScimPushOutcome,
  IScimPushSubscription,
  ScimPushDeliveryStatus,
  ScimPushEventKind,
} from './scim-push.types';

@Injectable()
export class ScimPushAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a subscription record. */
  validate(sub: IScimPushSubscription): string[] {
    return validateSubscription(sub);
  }

  /** Load one subscription. */
  async loadSubscription(id: string): Promise<IScimPushSubscription | null> {
    const row = await this.prisma.scimPushSubscription.findUnique({ where: { id } });
    return row ? toSubscription(row) : null;
  }

  /** List subscriptions for an org. */
  async listSubscriptions(orgId: string): Promise<IScimPushSubscription[]> {
    const rows = await this.prisma.scimPushSubscription.findMany({ where: { orgId } });
    return rows.map(toSubscription);
  }

  /** Count subscriptions for an org. */
  async countSubscriptions(orgId: string): Promise<number> {
    return this.prisma.scimPushSubscription.count({ where: { orgId } });
  }

  /** Whether the org can register another subscription. */
  async canRegister(orgId: string): Promise<boolean> {
    return canRegisterMore(await this.countSubscriptions(orgId));
  }

  /** Persist a subscription (upsert). */
  async persistSubscription(
    input: Partial<IScimPushSubscription> & {
      id: string;
      orgId: string;
      endpoint: string;
      signingSecret: string;
    }
  ): Promise<IScimPushSubscription> {
    const sub = normalizeSubscription(input);
    const errs = validateSubscription(sub);
    if (errs.length > 0) throw new Error(`invalid subscription: ${errs.join('; ')}`);
    await this.prisma.scimPushSubscription.upsert({
      where: { id: sub.id },
      create: {
        id: sub.id,
        orgId: sub.orgId,
        label: sub.label,
        endpoint: sub.endpoint,
        signingSecret: sub.signingSecret,
        filter: sub.filter as unknown as object,
        enabled: sub.enabled,
        createdAt: new Date(sub.createdAt),
        updatedAt: new Date(sub.updatedAt),
      },
      update: {
        label: sub.label,
        endpoint: sub.endpoint,
        signingSecret: sub.signingSecret,
        filter: sub.filter as unknown as object,
        enabled: sub.enabled,
        updatedAt: new Date(sub.updatedAt),
      },
    });
    return sub;
  }

  /** Disable a subscription. */
  async disableSubscription(id: string): Promise<boolean> {
    const sub = await this.loadSubscription(id);
    if (!sub) return false;
    sub.enabled = false;
    sub.updatedAt = new Date().toISOString();
    await this.persistSubscription(sub);
    return true;
  }

  /** Record an event and fan out to matching subscriptions. */
  async dispatchEvent(input: {
    orgId: string;
    kind: ScimPushEventKind;
    subjectId: string;
    externalId: string | null;
    payload: Record<string, unknown>;
    now?: Date;
  }): Promise<{ event: IScimPushEvent; deliveryIds: string[] }> {
    const now = (input.now ?? new Date()).toISOString();
    const event: IScimPushEvent = {
      id: `scim-evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      orgId: input.orgId,
      subscriptionId: '',
      kind: input.kind,
      subjectId: input.subjectId,
      externalId: input.externalId,
      payload: input.payload,
      occurredAt: now,
    };
    const subs = await this.listSubscriptions(input.orgId);
    const matched = subs.filter((s) => shouldDeliver(s, input.kind));
    const deliveryIds: string[] = [];
    for (const sub of matched) {
      const row = await this.prisma.scimPushDelivery.create({
        data: {
          eventId: event.id,
          subscriptionId: sub.id,
          status: 'pending',
          attempts: 0,
          lastAttemptAt: null,
          lastStatusCode: null,
          lastError: null,
          nextRetryAt: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      deliveryIds.push(row.id);
    }
    await this.prisma.scimPushEvent.create({
      data: {
        id: event.id,
        orgId: event.orgId,
        kind: event.kind,
        subjectId: event.subjectId,
        externalId: event.externalId,
        payload: event.payload as unknown as object,
        occurredAt: new Date(event.occurredAt),
      },
    });
    return { event, deliveryIds };
  }

  /** Build the HTTP envelope that the runner will POST. */
  buildHttpEnvelope(input: { subscription: IScimPushSubscription; event: IScimPushEvent }) {
    return buildRequest(input);
  }

  /** Persist the outcome of one HTTP attempt. */
  async recordAttempt(input: {
    deliveryId: string;
    statusCode: number | null;
    error: string | null;
    durationMs: number;
    options?: IScimPushOptions;
    now?: Date;
  }): Promise<{ delivery: IScimPushDelivery; outcome: IScimPushOutcome }> {
    const row = await this.prisma.scimPushDelivery.findUnique({ where: { id: input.deliveryId } });
    if (!row) throw new Error(`delivery not found: ${input.deliveryId}`);
    const delivery = toDelivery(row);
    const attempt: IScimPushDeliveryAttempt = {
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts + 1,
      attemptedAt: (input.now ?? new Date()).toISOString(),
      statusCode: input.statusCode,
      error: input.error,
      durationMs: input.durationMs,
    };
    const { delivery: next, outcome } = recordAttempt({
      delivery,
      attempt,
      ...(input.options ? { options: input.options } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    await this.prisma.scimPushDelivery.update({
      where: { id: next.id },
      data: {
        status: next.status,
        attempts: next.attempts,
        lastAttemptAt: next.lastAttemptAt ? new Date(next.lastAttemptAt) : null,
        lastStatusCode: next.lastStatusCode,
        lastError: next.lastError,
        nextRetryAt: next.nextRetryAt ? new Date(next.nextRetryAt) : null,
        updatedAt: new Date(next.updatedAt),
      },
    });
    return { delivery: next, outcome };
  }

  /** Compute the next back-off for a delivery (without recording). */
  computeBackoff(input: {
    attemptsSoFar: number;
    lastStatusCode: number | null;
    options?: IScimPushOptions;
  }) {
    return computeBackoff(input);
  }

  /** Load one delivery. */
  async loadDelivery(id: string): Promise<IScimPushDelivery | null> {
    const row = await this.prisma.scimPushDelivery.findUnique({ where: { id } });
    return row ? toDelivery(row) : null;
  }

  /** Mark a delivery delivered (skipping further attempts). */
  async markDelivered(id: string, statusCode: number): Promise<boolean> {
    const row = await this.prisma.scimPushDelivery.findUnique({ where: { id } });
    if (!row) return false;
    await this.prisma.scimPushDelivery.update({
      where: { id },
      data: {
        status: 'delivered' as ScimPushDeliveryStatus,
        attempts: row.attempts + 1,
        lastAttemptAt: new Date(),
        lastStatusCode: statusCode,
        nextRetryAt: null,
        updatedAt: new Date(),
      },
    });
    return true;
  }
}

function toSubscription(row: Record<string, unknown>): IScimPushSubscription {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    label: String(row['label'] ?? ''),
    endpoint: String(row['endpoint'] ?? ''),
    signingSecret: String(row['signingSecret'] ?? ''),
    filter: Array.isArray(row['filter'])
      ? ((row['filter'] as string[]).filter((k) => typeof k === 'string') as ScimPushEventKind[])
      : [],
    enabled: Boolean(row['enabled']),
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}

function toDelivery(row: Record<string, unknown>): IScimPushDelivery {
  return {
    id: String(row['id']),
    eventId: String(row['eventId']),
    subscriptionId: String(row['subscriptionId']),
    status: String(row['status']) as ScimPushDeliveryStatus,
    attempts: typeof row['attempts'] === 'number' ? (row['attempts'] as number) : 0,
    lastAttemptAt: row['lastAttemptAt']
      ? new Date(String(row['lastAttemptAt'])).toISOString()
      : null,
    lastStatusCode:
      typeof row['lastStatusCode'] === 'number' ? (row['lastStatusCode'] as number) : null,
    lastError: row['lastError'] ? String(row['lastError']) : null,
    nextRetryAt: row['nextRetryAt'] ? new Date(String(row['nextRetryAt'])).toISOString() : null,
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}
