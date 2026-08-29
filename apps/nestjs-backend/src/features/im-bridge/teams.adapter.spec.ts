import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamsAdapter } from './teams.adapter';

const VALID_URL = 'https://webhook.office.com/webhookb2/abc/IncomingWebhook/def';

const buildHttp = () =>
  ({
    post: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as unknown as HttpService & { post: ReturnType<typeof vi.fn> };

describe('TeamsAdapter.validateConfig', () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    adapter = new TeamsAdapter(buildHttp());
  });

  it('accepts a valid office.com webhook', () => {
    expect(adapter.validateConfig({ webhookUrl: VALID_URL }).ok).toBe(true);
  });

  it('rejects missing webhookUrl', () => {
    expect(adapter.validateConfig({}).ok).toBe(false);
  });

  it('rejects non-https webhookUrl', () => {
    expect(adapter.validateConfig({ webhookUrl: 'http://webhook.office.com/x' }).ok).toBe(false);
  });

  it('rejects webhookUrl outside office.com domain', () => {
    expect(adapter.validateConfig({ webhookUrl: 'https://example.com/webhook' }).ok).toBe(false);
  });
});

describe('TeamsAdapter.sendMessage', () => {
  let adapter: TeamsAdapter;
  let http: ReturnType<typeof buildHttp>;

  beforeEach(() => {
    http = buildHttp();
    adapter = new TeamsAdapter(http);
  });

  it('posts a MessageCard on a 2xx response and returns delivered=true', async () => {
    http.post.mockReturnValueOnce(of({ status: 200, data: '1' }));
    const result = await adapter.sendMessage(
      { webhookUrl: VALID_URL },
      { text: 'hello', title: 'Greetings' }
    );
    expect(result).toEqual({ delivered: true, status: 200 });
    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body, init] = http.post.mock.calls[0]!;
    expect(url).toBe(VALID_URL);
    expect(init.headers['content-type']).toBe('application/json');
    expect(body).toMatchObject({
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      title: 'Greetings',
      text: 'hello',
      themeColor: '0072C6',
    });
  });

  it('serialises fields as sections.facts when present', async () => {
    http.post.mockReturnValueOnce(of({ status: 200, data: '1' }));
    await adapter.sendMessage(
      { webhookUrl: VALID_URL },
      {
        text: 'summary',
        fields: [
          { name: 'tableId', value: 'tbl_1' },
          { name: 'recordId', value: 'rec_1' },
        ],
      }
    );
    const [, body] = http.post.mock.calls[0]!;
    expect(body.sections).toEqual([
      {
        facts: [
          { name: 'tableId', value: 'tbl_1' },
          { name: 'recordId', value: 'rec_1' },
        ],
      },
    ]);
  });

  it('surfaces a 4xx response as delivered=false with the status in the error', async () => {
    http.post.mockReturnValueOnce(
      throwError(() => ({
        response: { status: 410, data: 'channel gone' },
        message: 'Request failed',
      }))
    );
    const result = await adapter.sendMessage({ webhookUrl: VALID_URL }, { text: 'will fail' });
    expect(result.delivered).toBe(false);
    if (result.delivered === false) {
      expect(result.error).toContain('teams HTTP 410');
      expect(result.error).toContain('channel gone');
    }
  });

  it('falls back to the underlying error message when no response is present', async () => {
    http.post.mockReturnValueOnce(throwError(() => new Error('ECONNRESET')));
    const result = await adapter.sendMessage({ webhookUrl: VALID_URL }, { text: 'no net' });
    expect(result.delivered).toBe(false);
    if (result.delivered === false) {
      expect(result.error).toBe('ECONNRESET');
    }
  });

  it('rejects invalid config without ever calling http.post', async () => {
    const result = await adapter.sendMessage({ webhookUrl: 'http://insecure/x' }, { text: 'x' });
    expect(result).toEqual({
      delivered: false,
      error: 'webhookUrl must use https',
    });
    expect(http.post).not.toHaveBeenCalled();
  });
});
