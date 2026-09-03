/* eslint-disable @typescript-eslint/naming-convention */
/**
 * AuditScope + Redaction integration test (R53).
 *
 * Verifies that AuditScope.emitAtomic redacts sensitive values from
 * payload + params before forwarding to the event emitter (which the
 * AuditLogListener then persists).
 *
 * License: AGPL-3.0
 */

import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsServiceManager } from 'nestjs-cls';
import { describe, expect, it, vi } from 'vitest';

import { Events } from '../../event-emitter/events';
import { AuditScope } from './audit-scope';
import { REDACTED_MARKER } from './audit-redact';

const runInCls = async <T>(fn: () => Promise<T>): Promise<T> => {
  const cls = ClsServiceManager.getClsService();
  return cls.runWith({}, fn);
};

describe('AuditScope + Redaction (R53 integration)', () => {
  it('redacts sensitive keys in payload before emitting', async () => {
    const emitAsync = vi.fn().mockResolvedValue([]);
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const service = new AuditScope(ClsServiceManager.getClsService(), emitter);

    await runInCls(async () => {
      await service.emitAtomic({
        action: 'user.login',
        resourceId: 'user1',
        payload: {
          userId: 'user1',
          password: 'hunter2',
          token: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
          name: 'alice',
        },
      });
    });

    expect(emitAsync).toHaveBeenCalledTimes(1);
    const [eventName, event] = emitAsync.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe(Events.AUDIT_LOG_EMIT);
    expect(event.password).toBe(REDACTED_MARKER);
    expect(event.token).toBe(REDACTED_MARKER);
    expect(event.userId).toBeUndefined(); // payload.userId is extracted (audit decorator pattern)
    expect(event.name).toBe('alice');
  });

  it('redacts sensitive keys in params before emitting', async () => {
    const emitAsync = vi.fn().mockResolvedValue([]);
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const service = new AuditScope(ClsServiceManager.getClsService(), emitter);

    await runInCls(async () => {
      await service.emitAtomic({
        action: 'api.call',
        resourceId: 'base1',
        params: {
          authorization: 'Bearer abcdefghijklmnop',
          apiKey: 'AKIAIOSFODNN7EXAMPLE',
        },
      });
    });

    expect(emitAsync).toHaveBeenCalledTimes(1);
    const [, event] = emitAsync.mock.calls[0] as [string, Record<string, unknown>];
    const params = event.params as Record<string, unknown>;
    expect(params.authorization).toBe(REDACTED_MARKER);
    expect(params.apiKey).toBe(REDACTED_MARKER);
  });

  it('does not redact non-sensitive values', async () => {
    const emitAsync = vi.fn().mockResolvedValue([]);
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const service = new AuditScope(ClsServiceManager.getClsService(), emitter);

    await runInCls(async () => {
      await service.emitAtomic({
        action: 'row.create',
        resourceId: 'row1',
        payload: { tableId: 'tbl1', name: 'alice', count: 42 },
      });
    });

    const [, event] = emitAsync.mock.calls[0] as [string, Record<string, unknown>];
    expect(event.tableId).toBe('tbl1');
    expect(event.name).toBe('alice');
    expect(event.count).toBe(42);
  });

  it('no-op when resourceId is missing (existing behavior preserved)', async () => {
    const emitAsync = vi.fn().mockResolvedValue([]);
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const service = new AuditScope(ClsServiceManager.getClsService(), emitter);

    await runInCls(async () => {
      await service.emitAtomic({
        action: 'orphan',
        payload: { password: 'should-not-emit' },
      });
    });

    expect(emitAsync).not.toHaveBeenCalled();
  });
});
