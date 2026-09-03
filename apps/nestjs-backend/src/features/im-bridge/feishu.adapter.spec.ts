import type { HttpService } from '@nestjs/axios';
import { Response } from 'node-fetch';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/ssrf-http', () => ({ safeFetch: vi.fn() }));
const safeFetchMock = vi.mocked(await import('../../utils/ssrf-http')).safeFetch;

import { FeishuAdapter } from './feishu.adapter';

const buildHttp = () =>
  ({ post: vi.fn() }) as unknown as HttpService & { post: ReturnType<typeof vi.fn> };

const VALID_CONFIG = {
  appId: 'cli_test',
  appSecret: 'secret_test',
  receiveId: 'oc_chat_test',
  receiveIdType: 'chat_id' as const,
};

describe('FeishuAdapter.validateConfig', () => {
  let adapter: FeishuAdapter;

  beforeEach(() => {
    adapter = new FeishuAdapter(buildHttp());
  });

  it('accepts a valid self-built app config', () => {
    expect(adapter.validateConfig(VALID_CONFIG)).toEqual({ ok: true });
  });

  it('rejects missing credentials and invalid receiver type', () => {
    expect(adapter.validateConfig({}).ok).toBe(false);
    expect(adapter.validateConfig({ ...VALID_CONFIG, receiveIdType: 'bad' }).ok).toBe(false);
  });
});

describe('FeishuAdapter.sendMessage', () => {
  let adapter: FeishuAdapter;
  let http: ReturnType<typeof buildHttp>;

  beforeEach(() => {
    http = buildHttp();
    adapter = new FeishuAdapter(http);
    safeFetchMock.mockReset();
  });

  it('fetches a tenant token and sends a text message', async () => {
    http.post
      .mockReturnValueOnce(
        of({ status: 200, data: { code: 0, tenant_access_token: 't-1', expire: 7200 } })
      )
      .mockReturnValueOnce(of({ status: 200, data: { code: 0 } }));

    const result = await adapter.sendMessage(VALID_CONFIG, {
      title: 'Greetings',
      text: 'hello',
    });

    expect(result).toEqual({ delivered: true, status: 200 });
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post.mock.calls[0]![0]).toContain('/auth/v3/tenant_access_token/internal');
    expect(http.post.mock.calls[1]![0]).toContain('/im/v1/messages?receive_id_type=chat_id');
    expect(http.post.mock.calls[1]![2].headers.Authorization).toBe('Bearer t-1');
    expect(http.post.mock.calls[1]![1]).toEqual({
      receive_id: 'oc_chat_test',
      msg_type: 'text',
      content: JSON.stringify({ text: '**Greetings**\nhello' }),
    });
  });

  it('reuses a cached token for the same app', async () => {
    http.post
      .mockReturnValueOnce(
        of({ status: 200, data: { code: 0, tenant_access_token: 't-1', expire: 7200 } })
      )
      .mockReturnValueOnce(of({ status: 200, data: { code: 0 } }))
      .mockReturnValueOnce(of({ status: 200, data: { code: 0 } }));

    await adapter.sendMessage(VALID_CONFIG, { text: 'one' });
    await adapter.sendMessage(VALID_CONFIG, { text: 'two' });

    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('returns a provider error when token acquisition fails', async () => {
    http.post.mockReturnValueOnce(throwError(() => new Error('ECONNRESET')));
    const result = await adapter.sendMessage(VALID_CONFIG, { text: 'hello' });
    expect(result).toEqual({ delivered: false, error: 'token error: ECONNRESET' });
  });

  it('rejects invalid config without network calls', async () => {
    const result = await adapter.sendMessage({ ...VALID_CONFIG, appSecret: '' }, { text: 'hello' });
    expect(result.delivered).toBe(false);
    expect(http.post).not.toHaveBeenCalled();
  });

  it.each([
    ['image', { kind: 'image', imageKey: 'img_v2_test' }],
    ['file', { kind: 'file', fileKey: 'file_v2_test' }],
    ['post', { kind: 'post', providerPayload: { zh_cn: { title: '公告' } } }],
  ] as const)('sends %s Feishu message payloads', async (_kind, message) => {
    http.post
      .mockReturnValueOnce(
        of({ status: 200, data: { code: 0, tenant_access_token: 't-2', expire: 7200 } })
      )
      .mockReturnValueOnce(of({ status: 200, data: { code: 0 } }));

    const result = await adapter.sendMessage(VALID_CONFIG, {
      text: 'unused',
      ...message,
    });

    expect(result).toEqual({ delivered: true, status: 200 });
    expect(http.post.mock.calls[1]![1]).toMatchObject({
      msg_type: message.kind,
      content: JSON.stringify(
        message.kind === 'image'
          ? { image_key: message.imageKey }
          : message.kind === 'file'
            ? { file_key: message.fileKey }
            : message.providerPayload
      ),
    });
  });

  it('downloads a bounded source URL and uploads an image to Feishu', async () => {
    safeFetchMock.mockResolvedValue(
      new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: { ['content-type']: 'image/png', ['content-length']: '11' },
      })
    );
    http.post
      .mockReturnValueOnce(
        of({ status: 200, data: { code: 0, tenant_access_token: 't-upload', expire: 7200 } })
      )
      .mockReturnValueOnce(
        of({ status: 200, data: { code: 0, data: { image_key: 'img_uploaded' } } })
      );

    const result = await adapter.uploadFromUrl(VALID_CONFIG, {
      kind: 'image',
      sourceUrl: 'https://cdn.example.com/photo.png',
    });

    expect(result).toMatchObject({ uploaded: true, kind: 'image', key: 'img_uploaded' });
    expect(safeFetchMock).toHaveBeenCalledWith('https://cdn.example.com/photo.png', {
      method: 'GET',
    });
    expect(http.post.mock.calls[1]![0]).toContain('/im/v1/images');
  });

  it('rejects a source larger than the upload limit before reading it', async () => {
    safeFetchMock.mockResolvedValue(
      new Response(undefined, {
        status: 200,
        headers: { ['content-length']: String(11 * 1024 * 1024) },
      })
    );
    http.post.mockReturnValueOnce(
      of({ status: 200, data: { code: 0, tenant_access_token: 't-upload', expire: 7200 } })
    );

    await expect(
      adapter.uploadFromUrl(VALID_CONFIG, {
        kind: 'file',
        sourceUrl: 'https://cdn.example.com/large.zip',
      })
    ).resolves.toEqual({ uploaded: false, error: 'source file exceeds the 10 MiB upload limit' });
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});
