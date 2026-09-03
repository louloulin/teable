/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi } from 'vitest';

import { isValidRunnerResult, runOneDelivery, type IScimPushFetchLike, type IScimPushRunnerResult } from './scim-push-runner';
import type { IScimPushEvent, IScimPushSubscription } from './scim-push.types';

const baseSub: IScimPushSubscription = {
  id: 'sub1',
  orgId: 'org1',
  label: 'Okta',
  endpoint: 'https://idp.example.com/scim/push',
  signingSecret: 'a-very-secret-secret-12345678',
  filter: [],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const baseEvent: IScimPushEvent = {
  id: 'evt1',
  orgId: 'org1',
  subscriptionId: 'sub1',
  kind: 'user.created',
  subjectId: 'u1',
  externalId: 'okta-1',
  payload: { userName: 'alice' },
  occurredAt: '2026-01-01T00:00:00Z',
};

function mockFetch(impl: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>): IScimPushFetchLike {
  return vi.fn(impl) as unknown as IScimPushFetchLike;
}

describe('runOneDelivery', () => {
  it('posts to the subscription endpoint with signature header', async () => {
    let captured: { url: string; method: string; headers: Record<string, string>; body: string } | null = null;
    const fetchImpl = mockFetch(async (url, init) => {
      captured = {
        url,
        method: init?.method ?? '',
        headers: init?.headers ?? {},
        body: init?.body ?? '',
      };
      return { status: 200, text: async () => 'ok' };
    });

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl, timeoutMs: 1000, now: () => 1000 },
    });

    expect(result.statusCode).toBe(200);
    expect(result.error).toBeNull();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(baseSub.endpoint);
    expect(captured!.method).toBe('POST');
    expect(captured!.headers['content-type']).toBe('application/scim+json');
    expect(captured!.headers['x-scim-push-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(captured!.headers['x-scim-push-event-id']).toBe(baseEvent.id);
    const parsed = JSON.parse(captured!.body);
    expect(parsed.id).toBe(baseEvent.id);
    expect(parsed.kind).toBe(baseEvent.kind);
  });

  it('returns the HTTP status when IdP returns 5xx', async () => {
    const fetchImpl = mockFetch(async () => ({ status: 503, text: async () => 'unavailable' }));

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl, now: () => 0 },
    });

    expect(result.statusCode).toBe(503);
    expect(result.error).toBeNull();
    expect(result.bodyPreview).toBe('unavailable');
  });

  it('returns the HTTP status when IdP returns 4xx', async () => {
    const fetchImpl = mockFetch(async () => ({ status: 401, text: async () => 'unauthorized' }));

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl },
    });

    expect(result.statusCode).toBe(401);
    expect(result.error).toBeNull();
  });

  it('captures transport errors as runner.error', async () => {
    const fetchImpl = mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl },
    });

    expect(result.statusCode).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('translates AbortError to timeout message', async () => {
    const fetchImpl = mockFetch(async (_url, init) => {
      // Simulate undici AbortError
      const err = new Error('aborted');
      (err as Error & { name: string }).name = 'AbortError';
      throw err;
    });

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl, timeoutMs: 100 },
    });

    expect(result.statusCode).toBeNull();
    expect(result.error).toMatch(/timeout after 100ms/);
  });

  it('truncates response body preview at 4 KB', async () => {
    const long = 'x'.repeat(8 * 1024);
    const fetchImpl = mockFetch(async () => ({ status: 200, text: async () => long }));

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl },
    });

    expect(result.bodyPreview.length).toBe(4096);
  });

  it('measures duration with the injected clock', async () => {
    let clockMs = 1_000;
    const fetchImpl = mockFetch(async () => {
      clockMs = 1_750;
      return { status: 200, text: async () => 'ok' };
    });

    const result = await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl, now: () => clockMs },
    });

    expect(result.durationMs).toBe(750);
  });

  it('forwards AbortController signal to fetch', async () => {
    let receivedSignal: AbortSignal | undefined;
    const fetchImpl = mockFetch(async (_url, init) => {
      receivedSignal = init?.signal;
      return { status: 200, text: async () => 'ok' };
    });

    await runOneDelivery({
      subscription: baseSub,
      event: baseEvent,
      options: { fetchImpl, timeoutMs: 100 },
    });

    expect(receivedSignal).toBeDefined();
    expect(typeof receivedSignal!.aborted).toBe('boolean');
  });
});

describe('isValidRunnerResult', () => {
  const ok: IScimPushRunnerResult = { statusCode: 200, error: null, durationMs: 50, bodyPreview: 'ok' };
  const bad: IScimPushRunnerResult = { statusCode: null, error: null, durationMs: 50, bodyPreview: '' };
  const err: IScimPushRunnerResult = { statusCode: null, error: 'ECONNRESET', durationMs: 50, bodyPreview: '' };

  it('accepts a valid status code', () => {
    expect(isValidRunnerResult(ok)).toBe(true);
  });

  it('rejects a null status with null error', () => {
    expect(isValidRunnerResult(bad)).toBe(false);
  });

  it('accepts a transport error (null status + non-null error)', () => {
    expect(isValidRunnerResult(err)).toBe(true);
  });

  it('rejects out-of-range status codes', () => {
    expect(isValidRunnerResult({ ...ok, statusCode: 99 })).toBe(false);
    expect(isValidRunnerResult({ ...ok, statusCode: 600 })).toBe(false);
  });
});
