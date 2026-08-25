import { WebhookDispatcher, signBody } from './webhook-dispatcher.service';
import { vi } from 'vitest';
import { createHmac } from 'crypto';

const buildAutomationService = () => ({
  finishRun: vi.fn(async () => undefined),
});

const buildDispatcher = () => {
  const automationService = buildAutomationService();
  const dispatcher = new WebhookDispatcher(automationService as never);
  return { dispatcher, automationService };
};

describe('WebhookDispatcher (Stage 14)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signBody uses HMAC-SHA256 hex', () => {
    const sig = signBody('hello', 'topsecret');
    const expected = createHmac('sha256', 'topsecret').update('hello').digest('hex');
    expect(sig).toBe(expected);
  });

  it('refuses non-http(s) urls', async () => {
    const { dispatcher, automationService } = buildDispatcher();
    const result = await dispatcher.dispatch({
      runId: 'r1',
      config: { url: 'ftp://example.com' },
      payload: { foo: 'bar' },
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toMatch(/invalid webhook url/);
    expect(automationService.finishRun).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('signs body when secret is set and posts on 2xx', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 200 })
    );
    const { dispatcher, automationService } = buildDispatcher();
    const result = await dispatcher.dispatch({
      runId: 'r2',
      config: { url: 'https://example.com/hook', secret: 's3cret' },
      payload: { a: 1 },
    });
    expect(result.delivered).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe('https://example.com/hook');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-teable-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(headers['content-type']).toBe('application/json');
    expect(automationService.finishRun).toHaveBeenCalledWith(
      'r2',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('retries on 5xx then succeeds within maxRetries', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const { dispatcher, automationService } = buildDispatcher();
    const result = await dispatcher.dispatch({
      runId: 'r3',
      config: {
        url: 'https://example.com/h',
        secret: 'k',
        retryPolicy: { maxRetries: 1 },
      },
      payload: {},
    });
    expect(result.delivered).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(automationService.finishRun).toHaveBeenCalledWith(
      'r3',
      expect.objectContaining({ status: 'succeeded' })
    );
  }, 10_000);

  it('marks failed after retries exhausted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { dispatcher, automationService } = buildDispatcher();
    const result = await dispatcher.dispatch({
      runId: 'r4',
      config: { url: 'https://example.com/h', retryPolicy: { maxRetries: 0 } },
      payload: {},
    });
    expect(result.delivered).toBe(false);
    expect(fetchSpy.mock.calls.length).toBe(1);
    expect(automationService.finishRun).toHaveBeenCalledWith(
      'r4',
      expect.objectContaining({ status: 'failed', error: expect.stringMatching(/HTTP 500/) })
    );
  }, 10_000);

  it('uses PUT when method is specified', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );
    const { dispatcher } = buildDispatcher();
    await dispatcher.dispatch({
      runId: 'r5',
      config: { url: 'https://example.com/h', method: 'PUT' },
      payload: { x: 1 },
    });
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe('PUT');
  });
});
