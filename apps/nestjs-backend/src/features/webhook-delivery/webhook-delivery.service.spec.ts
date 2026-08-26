/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import {
  advanceDelivery,
  buildPayload,
  buildRequestHeaders,
  computeBackoff,
  decideNextStatus,
  endpointAcceptsEvent,
  isTerminalStatus,
  isValidUrl,
  isWebhookStatus,
  newDeliveryId,
  pickDueDeliveries,
  signBody,
  toRow,
} from './webhook-delivery.service';
import type {
  IWebhookDelivery,
  IWebhookDispatcher,
  IWebhookEndpoint,
  IWebhookPayload,
} from './webhook-delivery.types';

function mkEndpoint(over: Partial<IWebhookEndpoint> = {}): IWebhookEndpoint {
  return {
    id: 'ep_1',
    url: 'https://example.com/webhook',
    secret: 'topsecret',
    headers: {},
    events: [],
    maxAttempts: 5,
    enabled: true,
    createdTime: new Date('2024-01-01T00:00:00Z'),
    ...over,
  };
}

function mkDelivery(over: Partial<IWebhookDelivery> = {}): IWebhookDelivery {
  return {
    id: 'dlv_1',
    endpointId: 'ep_1',
    payloadId: 'pld_1',
    status: 'pending',
    attempt: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date('2024-06-01T00:00:00Z'),
    createdTime: new Date('2024-06-01T00:00:00Z'),
    ...over,
  };
}

function mkPayload(over: Partial<IWebhookPayload> = {}): IWebhookPayload {
  return {
    id: 'pld_1',
    event: 'record.update',
    body: '{"hello":"world"}',
    createdTime: new Date('2024-06-01T00:00:00Z'),
    ...over,
  };
}

function mkDispatcher(
  handler: (req: {
    method: string;
    url: string;
    body: string;
    headers: Record<string, string>;
  }) => Promise<{
    statusCode: number;
    body: string;
  }>
): IWebhookDispatcher {
  return {
    send: vi.fn(async (req) => handler(req)),
  };
}

describe('webhook-delivery.sign', () => {
  it('signBody is deterministic', () => {
    expect(signBody('hello', 'k1')).toBe(signBody('hello', 'k1'));
  });
  it('signBody differs on secret change', () => {
    expect(signBody('hello', 'k1')).not.toBe(signBody('hello', 'k2'));
  });

  it('buildRequestHeaders includes signature + delivery + event', () => {
    const h = buildRequestHeaders({
      body: 'b',
      secret: 'k',
      deliveryId: 'd_1',
      event: 'record.update',
    });
    expect(h['X-Teable-Signature']).toMatch(/^sha256=/);
    expect(h['X-Teable-Delivery']).toBe('d_1');
    expect(h['X-Teable-Event']).toBe('record.update');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('extra headers merged', () => {
    const h = buildRequestHeaders({
      body: 'b',
      secret: 'k',
      deliveryId: 'd',
      event: 'e',
      extra: { 'X-Foo': 'bar' },
    });
    expect(h['X-Foo']).toBe('bar');
  });
});

describe('webhook-delivery.validate', () => {
  it('isValidUrl accepts http/https', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('isWebhookStatus filters known values', () => {
    expect(isWebhookStatus('pending')).toBe(true);
    expect(isWebhookStatus('delivered')).toBe(true);
    expect(isWebhookStatus('dead')).toBe(true);
    expect(isWebhookStatus('unknown')).toBe(false);
  });

  it('isTerminalStatus', () => {
    expect(isTerminalStatus('delivered')).toBe(true);
    expect(isTerminalStatus('dead')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
  });

  it('endpointAcceptsEvent filters', () => {
    const ep = mkEndpoint({ events: ['record.update'] });
    expect(endpointAcceptsEvent(ep, 'record.update')).toBe(true);
    expect(endpointAcceptsEvent(ep, 'record.delete')).toBe(false);
  });
  it('endpointAcceptsEvent empty list = accept all', () => {
    expect(endpointAcceptsEvent(mkEndpoint(), 'anything')).toBe(true);
  });
});

describe('webhook-delivery.backoff', () => {
  it('computeBackoff grows exponentially', () => {
    const a = computeBackoff({ attempt: 1, random: () => 1 });
    const b = computeBackoff({ attempt: 2, random: () => 1 });
    expect(b).toBeGreaterThan(a);
  });
  it('computeBackoff caps at max', () => {
    const out = computeBackoff({ attempt: 30, maxMs: 1000, random: () => 1 });
    expect(out).toBeLessThanOrEqual(1000);
  });
  it('computeBackoff applies 0.5..1.0 jitter when random=0', () => {
    // attempt=0 → expWindow = 100 * 2^0 = 100, jitter 0 → 100 * (0.5 + 0) = 50
    const out = computeBackoff({ attempt: 0, baseMs: 100, random: () => 0 });
    expect(out).toBe(50);
  });
  it('computeBackoff with random=1 caps at full window', () => {
    // attempt=0 → expWindow = 100, jitter 1 → 100 * (0.5 + 0.5) = 100
    const out = computeBackoff({ attempt: 0, baseMs: 100, random: () => 1 });
    expect(out).toBe(100);
  });
});

describe('webhook-delivery.decideNextStatus', () => {
  it('http 200 → delivered', () => {
    expect(decideNextStatus({ attempt: 1, maxAttempts: 5, httpOk: true, retriable: false })).toBe(
      'delivered'
    );
  });
  it('retriable + attempts left → pending', () => {
    expect(decideNextStatus({ attempt: 1, maxAttempts: 5, httpOk: false, retriable: true })).toBe(
      'pending'
    );
  });
  it('non-retriable → dead', () => {
    expect(decideNextStatus({ attempt: 1, maxAttempts: 5, httpOk: false, retriable: false })).toBe(
      'dead'
    );
  });
  it('attempts exhausted → dead', () => {
    expect(decideNextStatus({ attempt: 5, maxAttempts: 5, httpOk: false, retriable: true })).toBe(
      'dead'
    );
  });
});

describe('webhook-delivery.advanceDelivery', () => {
  it('marks delivered on 200', async () => {
    const dispatcher = mkDispatcher(async () => ({ statusCode: 200, body: 'ok' }));
    const out = await advanceDelivery({
      delivery: mkDelivery(),
      endpoint: mkEndpoint(),
      payload: mkPayload(),
      dispatcher,
    });
    expect(out.next.status).toBe('delivered');
    expect(out.next.attempt).toBe(1);
    expect(out.next.deliveredAt).toBeInstanceOf(Date);
    expect(out.next.finalizedAt).toBeInstanceOf(Date);
  });

  it('returns to pending on 5xx', async () => {
    const dispatcher = mkDispatcher(async () => ({ statusCode: 502, body: 'bad' }));
    const out = await advanceDelivery({
      delivery: mkDelivery(),
      endpoint: mkEndpoint(),
      payload: mkPayload(),
      dispatcher,
    });
    expect(out.next.status).toBe('pending');
    expect(out.next.attempt).toBe(1);
    expect(out.next.deliveredAt).toBeUndefined();
  });

  it('goes to dead after maxAttempts on 5xx', async () => {
    const dispatcher = mkDispatcher(async () => ({ statusCode: 500, body: 'bad' }));
    const out = await advanceDelivery({
      delivery: mkDelivery({ attempt: 4 }),
      endpoint: mkEndpoint(),
      payload: mkPayload(),
      dispatcher,
    });
    expect(out.next.status).toBe('dead');
    expect(out.next.attempt).toBe(5);
  });

  it('4xx (non-retriable) goes to dead immediately', async () => {
    const dispatcher = mkDispatcher(async () => ({ statusCode: 400, body: 'bad' }));
    const out = await advanceDelivery({
      delivery: mkDelivery(),
      endpoint: mkEndpoint(),
      payload: mkPayload(),
      dispatcher,
    });
    expect(out.next.status).toBe('dead');
  });

  it('429 retriable', async () => {
    const dispatcher = mkDispatcher(async () => ({ statusCode: 429, body: '' }));
    const out = await advanceDelivery({
      delivery: mkDelivery({ attempt: 0, maxAttempts: 3 }),
      endpoint: mkEndpoint(),
      payload: mkPayload(),
      dispatcher,
    });
    expect(out.next.status).toBe('pending');
  });

  it('signed body sent through', async () => {
    let captured: { body: string; headers: Record<string, string> } | undefined;
    const dispatcher: IWebhookDispatcher = {
      send: vi.fn(async (req) => {
        captured = { body: req.body, headers: req.headers };
        return { statusCode: 200, body: 'ok' };
      }),
    };
    await advanceDelivery({
      delivery: mkDelivery(),
      endpoint: mkEndpoint(),
      payload: mkPayload({ body: '{"hello":"world"}' }),
      dispatcher,
    });
    expect(captured?.body).toBe('{"hello":"world"}');
    expect(captured?.headers['X-Teable-Signature']).toMatch(/^sha256=/);
  });
});

describe('webhook-delivery.pickDueDeliveries', () => {
  it('returns only pending+due', () => {
    const now = new Date('2024-06-01T00:00:00Z');
    const list = [
      mkDelivery({ id: 'a', status: 'pending', nextAttemptAt: new Date('2024-05-01') }),
      mkDelivery({ id: 'b', status: 'pending', nextAttemptAt: new Date('2024-07-01') }),
      mkDelivery({ id: 'c', status: 'delivered', nextAttemptAt: new Date('2024-01-01') }),
      mkDelivery({ id: 'd', status: 'failed', nextAttemptAt: new Date('2024-05-01') }),
    ];
    const due = pickDueDeliveries(list, now);
    expect(due.map((d) => d.id)).toEqual(['a', 'd']);
  });
});

describe('webhook-delivery.helpers', () => {
  it('buildPayload sets time + id', () => {
    const p = buildPayload({ event: 'e', body: 'b' });
    expect(p.event).toBe('e');
    expect(p.id).toMatch(/^pld_/);
  });
  it('toRow maps fields', () => {
    const r = toRow(
      mkDelivery({ lastStatusCode: 500, lastError: 'fail', lastAttemptAt: new Date() })
    );
    expect(r.lastStatusCode).toBe(500);
    expect(r.lastError).toBe('fail');
  });
  it('newDeliveryId format', () => {
    expect(newDeliveryId()).toMatch(/^dlv_/);
  });
});
