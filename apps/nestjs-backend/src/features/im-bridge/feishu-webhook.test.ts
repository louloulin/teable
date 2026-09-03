import { describe, expect, it, vi } from 'vitest';

import { FeishuWebhookController } from './feishu-webhook.controller';
import { computeFeishuEventSignature, verifyFeishuEventSignature } from './feishu.adapter';

const config = {
  appId: 'cli_test',
  appSecret: 'secret_test',
  receiveId: 'oc_chat_test',
  receiveIdType: 'chat_id' as const,
  verificationToken: 'verify_test',
  encryptKey: 'encrypt_test',
};

describe('Feishu event verification', () => {
  it('accepts a current signature and rejects a stale or tampered signature', () => {
    const rawBody = JSON.stringify({ header: { event_id: 'evt_1' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeFeishuEventSignature(timestamp, 'nonce', config.encryptKey, rawBody);

    expect(
      verifyFeishuEventSignature({
        timestamp,
        nonce: 'nonce',
        signature,
        encryptKey: config.encryptKey,
        rawBody,
        nowSeconds: Number(timestamp),
      })
    ).toEqual({ ok: true });
    expect(
      verifyFeishuEventSignature({
        timestamp,
        nonce: 'nonce',
        signature: `${signature.slice(0, -1)}0`,
        encryptKey: config.encryptKey,
        rawBody,
        nowSeconds: Number(timestamp),
      }).ok
    ).toBe(false);
    expect(
      verifyFeishuEventSignature({
        timestamp,
        nonce: 'nonce',
        signature,
        encryptKey: config.encryptKey,
        rawBody,
        nowSeconds: Number(timestamp) + 1000,
      }).ok
    ).toBe(false);
  });
});

describe('FeishuWebhookController', () => {
  it('answers url_verification without requiring event signature', async () => {
    const service = {
      getDecryptedConfig: vi.fn().mockResolvedValue(config),
    };
    const controller = new FeishuWebhookController(service as never, {} as never);

    await expect(
      controller.receive(
        'spc_test',
        { type: 'url_verification', token: 'verify_test', challenge: 'challenge_1' },
        { body: {} } as never
      )
    ).resolves.toEqual({ challenge: 'challenge_1' });
  });

  it('persists a signed event once and acknowledges a duplicate without creating again', async () => {
    const service = { getDecryptedConfig: vi.fn().mockResolvedValue(config) };
    const prisma = {
      webhookEvent: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' }),
        create: vi.fn().mockResolvedValue({ id: 'feishu_evt_1' }),
      },
    };
    const events = { emit: vi.fn() };
    const controller = new FeishuWebhookController(
      service as never,
      prisma as never,
      events as never
    );
    const body = {
      header: { event_id: 'evt_1', event_type: 'im.message.receive_v1' },
      event: { message: { content: JSON.stringify({ text: 'hello' }) } },
    };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeFeishuEventSignature(timestamp, 'nonce', config.encryptKey, rawBody);
    const request = { rawBody: Buffer.from(rawBody) } as never;

    await expect(
      controller.receive('spc_test', body, request, timestamp, 'nonce', signature)
    ).resolves.toMatchObject({ accepted: true, deduplicated: false, eventId: 'evt_1' });
    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalEventId: 'feishu:spc_test:evt_1',
        eventType: 'im.message.receive_v1',
        payloadJson: rawBody,
      }),
    });

    await expect(
      controller.receive('spc_test', body, request, timestamp, 'nonce', signature)
    ).resolves.toMatchObject({ accepted: true, deduplicated: true, eventId: 'evt_1' });
    expect(prisma.webhookEvent.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'im.feishu.message',
      expect.objectContaining({
        spaceId: 'spc_test',
        eventId: 'evt_1',
      })
    );
  });
});
