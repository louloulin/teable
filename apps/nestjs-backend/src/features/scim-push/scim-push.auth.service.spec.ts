/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { ScimPushAuthService } from './scim-push.auth.service';
import type { IScimPushSubscription } from './scim-push.types';

function mkPrismaMock() {
  const subscriptionFindUnique = vi.fn();
  const subscriptionFindMany = vi.fn();
  const subscriptionUpsert = vi.fn();
  const subscriptionCount = vi.fn();
  const deliveryFindUnique = vi.fn();
  const deliveryCreate = vi.fn();
  const deliveryUpdate = vi.fn();
  const eventCreate = vi.fn();
  const prisma = {
    scimPushSubscription: {
      findUnique: subscriptionFindUnique,
      findMany: subscriptionFindMany,
      upsert: subscriptionUpsert,
      count: subscriptionCount,
    },
    scimPushDelivery: {
      findUnique: deliveryFindUnique,
      create: deliveryCreate,
      update: deliveryUpdate,
    },
    scimPushEvent: {
      create: eventCreate,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      subscriptionFindUnique,
      subscriptionFindMany,
      subscriptionUpsert,
      subscriptionCount,
      deliveryFindUnique,
      deliveryCreate,
      deliveryUpdate,
      eventCreate,
    },
  };
}

const baseSub: IScimPushSubscription = {
  id: 'sub1',
  orgId: 'org1',
  label: 'Okta',
  endpoint: 'https://example.com/scim/push',
  signingSecret: 'a-very-secret-secret-12345678',
  filter: [],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ScimPushAuthService', () => {
  it('validate() delegates to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new ScimPushAuthService(prisma);
    expect(svc.validate(baseSub)).toEqual([]);
  });

  it('loadSubscription() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindUnique.mockResolvedValue(null);
    const svc = new ScimPushAuthService(prisma);
    expect(await svc.loadSubscription('missing')).toBeNull();
  });

  it('loadSubscription() maps a row', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindUnique.mockResolvedValue({
      ...baseSub,
      filter: ['user.created'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new ScimPushAuthService(prisma);
    const sub = await svc.loadSubscription('sub1');
    expect(sub?.filter).toEqual(['user.created']);
  });

  it('listSubscriptions() returns mapped rows', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindMany.mockResolvedValue([
      {
        ...baseSub,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new ScimPushAuthService(prisma);
    const out = await svc.listSubscriptions('org1');
    expect(out.length).toBe(1);
  });

  it('canRegister() blocks at cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionCount.mockResolvedValue(8);
    const svc = new ScimPushAuthService(prisma);
    expect(await svc.canRegister('org1')).toBe(false);
  });

  it('disableSubscription() flips enabled', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindUnique.mockResolvedValue({
      ...baseSub,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    mocks.subscriptionUpsert.mockResolvedValue({});
    const svc = new ScimPushAuthService(prisma);
    expect(await svc.disableSubscription('sub1')).toBe(true);
    expect(mocks.subscriptionUpsert).toHaveBeenCalled();
  });

  it('disableSubscription() returns false when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindUnique.mockResolvedValue(null);
    const svc = new ScimPushAuthService(prisma);
    expect(await svc.disableSubscription('missing')).toBe(false);
  });

  it('dispatchEvent() creates deliveries for matching subs', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.subscriptionFindMany.mockResolvedValue([
      {
        ...baseSub,
        filter: ['user.created'],
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    mocks.deliveryCreate.mockResolvedValue({ id: 'd1' });
    mocks.eventCreate.mockResolvedValue({});
    const svc = new ScimPushAuthService(prisma);
    const r = await svc.dispatchEvent({
      orgId: 'org1',
      kind: 'user.created',
      subjectId: 'u1',
      externalId: 'okta-1',
      payload: { userName: 'alice' },
    });
    expect(r.deliveryIds.length).toBe(1);
    expect(mocks.eventCreate).toHaveBeenCalled();
  });

  it('recordAttempt() persists the outcome', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.deliveryFindUnique.mockResolvedValue({
      id: 'd1',
      eventId: 'evt1',
      subscriptionId: 'sub1',
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      lastStatusCode: null,
      lastError: null,
      nextRetryAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    mocks.deliveryUpdate.mockResolvedValue({});
    const svc = new ScimPushAuthService(prisma);
    const r = await svc.recordAttempt({
      deliveryId: 'd1',
      statusCode: 500,
      error: null,
      durationMs: 50,
    });
    expect(r.delivery.attempts).toBe(1);
    expect(mocks.deliveryUpdate).toHaveBeenCalled();
  });

  it('markDelivered() returns false when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.deliveryFindUnique.mockResolvedValue(null);
    const svc = new ScimPushAuthService(prisma);
    expect(await svc.markDelivered('missing', 200)).toBe(false);
  });

  it('buildHttpEnvelope() delegates', () => {
    const { prisma } = mkPrismaMock();
    const svc = new ScimPushAuthService(prisma);
    const envelope = svc.buildHttpEnvelope({
      subscription: baseSub,
      event: {
        id: 'evt1',
        orgId: 'org1',
        subscriptionId: 'sub1',
        kind: 'user.created',
        subjectId: 'u1',
        externalId: 'okta-1',
        payload: { userName: 'alice' },
        occurredAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(envelope.headers['x-scim-push-signature']).toMatch(/^sha256=/);
  });
});
