import {
  WEBHOOK_DELIVERY_DISPATCH_JOB,
  WEBHOOK_DELIVERY_REPEAT_MS,
} from './webhook-delivery.constants';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';

describe('WebhookDeliveryProcessor', () => {
  it('registers an idempotent repeat job', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add, close: vi.fn().mockResolvedValue(undefined) };
    const processor = new WebhookDeliveryProcessor({} as never, queue as never);

    await processor.onModuleInit();
    await processor.onModuleInit();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      WEBHOOK_DELIVERY_DISPATCH_JOB,
      {},
      expect.objectContaining({
        jobId: `${WEBHOOK_DELIVERY_DISPATCH_JOB}-repeat`,
        repeat: { every: WEBHOOK_DELIVERY_REPEAT_MS },
      })
    );
  });

  it('dispatches all due deliveries and continues after one failure', async () => {
    const deliveries = [{ id: 'dlv_1' }, { id: 'dlv_2' }];
    const listDue = vi.fn().mockResolvedValue(deliveries);
    const dispatchOne = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce({ status: 'delivered' });
    const processor = new WebhookDeliveryProcessor(
      { listDue, dispatchOne } as never,
      { add: vi.fn(), close: vi.fn() } as never
    );

    await expect(
      processor.process({ name: WEBHOOK_DELIVERY_DISPATCH_JOB } as never)
    ).resolves.toEqual({ dispatched: 1, failed: 1 });
    expect(dispatchOne).toHaveBeenCalledTimes(2);
  });
});
