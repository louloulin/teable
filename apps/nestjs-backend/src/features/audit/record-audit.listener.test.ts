import { describe, expect, it, vi } from 'vitest';
import { Events, RecordCreateEvent } from '../../event-emitter/events';
import { RecordAuditListener } from './record-audit.listener';

describe('RecordAuditListener', () => {
  it('persists one audit row per created record', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const listener = new RecordAuditListener(
      { auditEvent: { create } } as never,
      { get: vi.fn().mockReturnValue(undefined), getId: vi.fn().mockReturnValue('req1') } as never
    );
    const event = new RecordCreateEvent(
      'tbl1',
      [
        { id: 'rec1', fields: {} },
        { id: 'rec2', fields: {} },
      ] as never,
      { user: { id: 'usr1', name: 'User', email: 'user@example.com' } }
    );

    await listener.onCreate(event);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ id: `${event.id}-rec1`, action: 'record.create' })
    );
  });

  it('does not reject the event when persistence fails', async () => {
    const listener = new RecordAuditListener(
      { auditEvent: { create: vi.fn().mockRejectedValue(new Error('db unavailable')) } } as never,
      { get: vi.fn().mockReturnValue(undefined), getId: vi.fn() } as never
    );

    await expect(
      listener.onDelete({
        id: 'evt1',
        name: Events.TABLE_RECORD_DELETE,
        payload: { tableId: 'tbl1', recordId: 'rec1' },
        context: {},
      } as never)
    ).resolves.toBeUndefined();
  });
});
