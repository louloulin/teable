import { Events } from '../../event-emitter/events';
import { WebhookDeliveryListener } from './webhook-delivery.listener';

describe('WebhookDeliveryListener', () => {
  it('maps table record events to webhook event names and payloads', async () => {
    const enqueueEvent = vi.fn().mockResolvedValue(1);
    const listener = new WebhookDeliveryListener({ enqueueEvent } as never);

    await listener.handle({
      id: 'evt_1',
      name: Events.TABLE_RECORD_UPDATE,
      payload: { tableId: 'tbl_1', record: { id: 'rec_1' }, oldField: undefined },
      context: { user: { id: 'usr_1', name: 'Test', email: 'test@example.com' } },
      isBulk: false,
    } as never);

    expect(enqueueEvent).toHaveBeenCalledWith({
      event: 'record.update',
      body: expect.stringContaining('"tableId":"tbl_1"'),
    });
  });

  it('does not allow enqueue errors to break the record event pipeline', async () => {
    const enqueueEvent = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const listener = new WebhookDeliveryListener({ enqueueEvent } as never);

    await expect(
      listener.handle({
        id: 'evt_1',
        name: Events.TABLE_RECORD_CREATE,
        payload: { tableId: 'tbl_1', record: { id: 'rec_1' } },
        context: {},
        isBulk: false,
      } as never)
    ).resolves.toBeUndefined();
  });
});
