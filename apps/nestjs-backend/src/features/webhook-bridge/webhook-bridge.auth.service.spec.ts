/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { WebhookBridgeAuthService } from './webhook-bridge.auth.service';
import { computeHmacSignature } from './webhook-bridge.service';
import type { IInboundEnvelope, IWebhookBridge } from './webhook-bridge.types';

function mkPrismaMock() {
  const webhookBridgeFindUnique = vi.fn();
  const prisma = {
    webhookBridge: { findUnique: webhookBridgeFindUnique },
  } as unknown as PrismaService;
  return { prisma, mocks: { webhookBridgeFindUnique } };
}

const bridge: IWebhookBridge = {
  id: 'b1',
  baseId: 'base1',
  name: 'Inbound',
  direction: 'inbound',
  auth: { scheme: 'hmac-sha256', secret: 'topsecret' },
  target: 'automation',
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const env = (over: Partial<IInboundEnvelope> = {}): IInboundEnvelope => ({
  bridgeId: 'b1',
  rawBody: '{"type":"record.create","id":"r1"}',
  headers: { 'content-type': 'application/json' },
  receivedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('WebhookBridgeAuthService', () => {
  it('delegates validate() to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    expect(svc.validate(bridge)).toEqual([]);
  });
  it('loadBridge returns null when not found', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.webhookBridgeFindUnique.mockResolvedValue(null);
    const svc = new WebhookBridgeAuthService(prisma);
    expect(await svc.loadBridge('missing')).toBeNull();
  });
  it('loadBridge maps row to domain', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.webhookBridgeFindUnique.mockResolvedValue({
      id: 'b1',
      baseId: 'base1',
      name: 'Inbound',
      direction: 'inbound',
      auth: { scheme: 'hmac-sha256', secret: 'topsecret' },
      target: 'automation',
      enabled: true,
      eventTypes: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new WebhookBridgeAuthService(prisma);
    const out = await svc.loadBridge('b1');
    expect(out?.id).toBe('b1');
    expect(out?.auth.scheme).toBe('hmac-sha256');
  });
  it('handleInbound accepts a valid signature + builds dispatch', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    const sig = computeHmacSignature('{"type":"record.create"}', 'topsecret');
    const { dispatch, reason } = await svc.handleInbound(
      bridge,
      env({
        rawBody: '{"type":"record.create"}',
        headers: { 'x-signature': sig },
      })
    );
    expect(reason).toBeUndefined();
    expect(dispatch?.envelope.bridgeId).toBe('b1');
    expect(dispatch?.envelope.eventType).toBe('record.create');
  });
  it('handleInbound rejects when bridge is disabled', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    const out = await svc.handleInbound({ ...bridge, enabled: false }, env());
    expect(out.dispatch).toBeNull();
    expect(out.reason).toBe('bridge-disabled');
  });
  it('handleInbound rejects when signature fails', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    const out = await svc.handleInbound(bridge, env({ headers: { 'x-signature': 'bad' } }));
    expect(out.dispatch).toBeNull();
    expect(out.reason).toBe('bad-signature');
  });
  it('handleInbound rejects when event-type filter misses', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    const sig = computeHmacSignature('{"type":"order.paid"}', 'topsecret');
    const out = await svc.handleInbound(
      { ...bridge, eventTypes: ['record.create'] },
      env({ rawBody: '{"type":"order.paid"}', headers: { 'x-signature': sig } })
    );
    expect(out.dispatch).toBeNull();
    expect(out.reason).toBe('event-filter-miss');
  });
  it('handleInbound accepts non-JSON body as raw payload', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new WebhookBridgeAuthService(prisma);
    const sig = computeHmacSignature('plain', 'topsecret');
    const out = await svc.handleInbound(
      bridge,
      env({
        rawBody: 'plain',
        headers: { 'x-signature': sig },
      })
    );
    expect(out.dispatch?.envelope.payload._raw).toBe('plain');
  });
});
