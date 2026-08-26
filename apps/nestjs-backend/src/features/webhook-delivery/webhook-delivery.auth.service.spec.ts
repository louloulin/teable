/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';
import type { IWebhookDispatcher } from './webhook-delivery.types';

interface IMockEndpointRow {
  id: string;
  url: string;
  secret: string;
  events: ReadonlyArray<string>;
  maxAttempts: number;
  enabled: boolean;
  createdTime: Date;
  headers: Record<string, string> | null;
}

interface IMockDeliveryRow {
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
}

function mkEndpoint(over: Partial<IMockEndpointRow> = {}): IMockEndpointRow {
  return {
    id: 'ep_1',
    url: 'https://example.com',
    secret: 'topsecret',
    events: [],
    maxAttempts: 5,
    enabled: true,
    createdTime: new Date('2024-01-01T00:00:00Z'),
    headers: null,
    ...over,
  };
}

function mkDelivery(over: Partial<IMockDeliveryRow> = {}): IMockDeliveryRow {
  return {
    id: 'dlv_1',
    endpointId: 'ep_1',
    payloadId: 'pld_1',
    status: 'pending',
    attempt: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    lastStatusCode: null,
    lastError: null,
    lastAttemptAt: null,
    finalizedAt: null,
    deliveredAt: null,
    createdTime: new Date(),
    ...over,
  };
}

function mkPrismaMock() {
  const endpointFindUnique = vi.fn();
  const endpointCreate = vi.fn();
  const deliveryCreate = vi.fn();
  const deliveryFindMany = vi.fn();
  const deliveryFindUnique = vi.fn();
  const deliveryUpdate = vi.fn();
  const deliveryDelete = vi.fn();
  const payloadCreate = vi.fn();
  const payloadFindUnique = vi.fn();
  const prisma = {
    webhookEndpoint: {
      findUnique: endpointFindUnique,
      create: endpointCreate,
    },
    webhookDelivery: {
      create: deliveryCreate,
      findMany: deliveryFindMany,
      findUnique: deliveryFindUnique,
      update: deliveryUpdate,
      delete: deliveryDelete,
    },
    webhookPayload: {
      create: payloadCreate,
      findUnique: payloadFindUnique,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      endpointFindUnique,
      endpointCreate,
      deliveryCreate,
      deliveryFindMany,
      deliveryFindUnique,
      deliveryUpdate,
      deliveryDelete,
      payloadCreate,
      payloadFindUnique,
    },
  };
}

function mkDispatcher(statusCode = 200): IWebhookDispatcher {
  return {
    send: vi.fn(async () => ({ statusCode, body: 'ok' })),
  };
}

describe('WebhookDeliveryAuthService', () => {
  describe('enqueue', () => {
    it('persists payload + delivery when endpoint matches', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.endpointFindUnique.mockResolvedValue(mkEndpoint());
      mocks.payloadCreate.mockResolvedValue({ id: 'pld_new' });
      mocks.deliveryCreate.mockResolvedValue(mkDelivery({ id: 'dlv_new' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      const out = await svc.enqueue({ endpointId: 'ep_1', event: 'record.update', body: '{}' });
      expect(out.status).toBe('pending');
      expect(mocks.payloadCreate).toHaveBeenCalledTimes(1);
      expect(mocks.deliveryCreate).toHaveBeenCalledTimes(1);
    });

    it('rejects missing endpoint', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(svc.enqueue({ endpointId: 'nope', event: 'e', body: '' })).rejects.toThrow();
    });

    it('rejects disabled endpoint', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.endpointFindUnique.mockResolvedValue(mkEndpoint({ enabled: false }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(svc.enqueue({ endpointId: 'ep_1', event: 'e', body: '' })).rejects.toThrow(
        /disabled/
      );
    });

    it('rejects event not in filter', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.endpointFindUnique.mockResolvedValue(mkEndpoint({ events: ['record.update'] }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(
        svc.enqueue({ endpointId: 'ep_1', event: 'record.delete', body: '' })
      ).rejects.toThrow();
    });
  });

  describe('listDue', () => {
    it('returns only due pending + failed', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const past = new Date('2024-01-01T00:00:00Z');
      mocks.deliveryFindMany.mockResolvedValue([
        mkDelivery({ id: 'a', status: 'pending', nextAttemptAt: past }),
        mkDelivery({ id: 'b', status: 'pending', nextAttemptAt: new Date('2099-01-01') }),
        mkDelivery({ id: 'c', status: 'delivered', nextAttemptAt: past }),
      ]);
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      const due = await svc.listDue(new Date('2024-06-01'));
      expect(due.map((d) => d.id)).toEqual(['a']);
    });
  });

  describe('dispatchOne', () => {
    it('marks delivered on 200', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.endpointFindUnique.mockResolvedValue(mkEndpoint());
      mocks.payloadFindUnique.mockResolvedValue({
        id: 'pld_1',
        event: 'record.update',
        body: '{}',
        createdTime: new Date(),
      });
      mocks.deliveryUpdate.mockResolvedValue(mkDelivery({ status: 'delivered' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher(200));
      const r = await svc.dispatchOne({ delivery: mkDelivery() });
      expect(r.status).toBe('delivered');
    });

    it('marks dead after max attempts on 5xx', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.endpointFindUnique.mockResolvedValue(mkEndpoint());
      mocks.payloadFindUnique.mockResolvedValue({
        id: 'pld_1',
        event: 'e',
        body: '{}',
        createdTime: new Date(),
      });
      mocks.deliveryUpdate.mockResolvedValue(mkDelivery({ status: 'dead', attempt: 5 }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher(500));
      const r = await svc.dispatchOne({ delivery: mkDelivery({ attempt: 4 }) });
      expect(r.status).toBe('dead');
    });
  });

  describe('listDead + retryDead + deleteDelivery', () => {
    it('lists dead', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindMany.mockResolvedValue([mkDelivery({ status: 'dead' })]);
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      const out = await svc.listDead();
      expect(out[0]?.status).toBe('dead');
    });

    it('retryDead moves to pending', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindUnique.mockResolvedValue(mkDelivery({ status: 'dead' }));
      mocks.deliveryUpdate.mockResolvedValue(mkDelivery({ status: 'pending' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      const out = await svc.retryDead('dlv_1');
      expect(out.status).toBe('pending');
    });

    it('retryDead rejects non-dead', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindUnique.mockResolvedValue(mkDelivery({ status: 'pending' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(svc.retryDead('dlv_1')).rejects.toThrow(/dead/);
    });

    it('deleteDelivery removes the row', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryDelete.mockResolvedValue(undefined);
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await svc.deleteDelivery('dlv_1');
      expect(mocks.deliveryDelete).toHaveBeenCalledWith({ where: { id: 'dlv_1' } });
    });
  });

  describe('retry (fresh-attempt re-queue)', () => {
    it('creates a new delivery with attemptId + retried=true', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindUnique.mockResolvedValue(mkDelivery({ status: 'dead', attempt: 5 }));
      mocks.deliveryCreate.mockResolvedValue(mkDelivery({ id: 'dlv_new', status: 'pending' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      const out = await svc.retry('dlv_1', 'user_admin');
      expect(out.retried).toBe(true);
      expect(out.attemptId).toMatch(/^dlv_/);
      // The original dead-letter row was NOT mutated.
      expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
      // A fresh row was created with attempt=0 and status='pending'.
      const createdArgs = mocks.deliveryCreate.mock.calls[0]?.[0];
      expect(createdArgs?.data?.status).toBe('pending');
      expect(createdArgs?.data?.attempt).toBe(0);
      expect(createdArgs?.data?.id).toBe(out.attemptId);
      expect(createdArgs?.data?.payloadId).toBe('pld_1');
      expect(createdArgs?.data?.endpointId).toBe('ep_1');
    });

    it('rejects when delivery not found', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindUnique.mockResolvedValue(null);
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(svc.retry('missing', 'user_admin')).rejects.toThrow(/not found/);
    });

    it('rejects when delivery is not in dead-letter', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deliveryFindUnique.mockResolvedValue(mkDelivery({ status: 'pending' }));
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      await expect(svc.retry('dlv_1', 'user_admin')).rejects.toThrow(/dead-letter/);
      // Must NOT create a new row when the source isn't dead.
      expect(mocks.deliveryCreate).not.toHaveBeenCalled();
    });
  });

  describe('exposed helpers', () => {
    it('isValidUrl exposed', () => {
      const { prisma } = mkPrismaMock();
      const svc = new WebhookDeliveryAuthService(prisma, mkDispatcher());
      expect(svc.isValidUrl('https://example.com')).toBe(true);
    });
  });
});
