import { vi } from 'vitest';
import { WebhookDeliveryAdminController } from './webhook-delivery.admin.controller';

describe('WebhookDeliveryAdminController', () => {
  it('maps dead-letter rows to the OpenAPI response', async () => {
    const controller = new WebhookDeliveryAdminController(
      {
        listDead: vi.fn().mockResolvedValue([
          {
            id: 'delivery-1',
            endpointId: 'endpoint-1',
            payloadId: 'payload-1',
            status: 'dead',
            attempt: 5,
            maxAttempts: 5,
            lastStatusCode: 503,
            lastError: 'upstream unavailable',
            finalizedAt: new Date('2026-08-29T00:00:00.000Z'),
            createdTime: new Date('2026-08-28T00:00:00.000Z'),
            nextAttemptAt: new Date('2026-08-29T00:00:00.000Z'),
          },
        ]),
      } as never,
      {} as never
    );

    await expect(controller.listDeadLetter()).resolves.toStrictEqual({
      rows: [
        {
          id: 'delivery-1',
          endpointId: 'endpoint-1',
          payloadId: 'payload-1',
          status: 'dead',
          attempt: 5,
          maxAttempts: 5,
          lastStatusCode: 503,
          lastError: 'upstream unavailable',
          finalizedAt: '2026-08-29T00:00:00.000Z',
          createdTime: '2026-08-28T00:00:00.000Z',
        },
      ],
      total: 1,
    });
  });
});
