import { describe, expect, it, vi } from 'vitest';

import { AuditLogListener } from './audit-log.listener';

describe('AuditLogListener', () => {
  it('persists audit emissions in the AuditEvent shape', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { auditEvent: { create } } as never;
    const cls = {
      get: vi.fn((key: string) => {
        if (key === 'user') return { id: 'usr1' };
        if (key === 'organization') return { id: 'org1' };
        if (key === 'origin') return { ip: '127.0.0.1' };
        return undefined;
      }),
      getId: vi.fn().mockReturnValue('req1'),
    } as never;
    const listener = new AuditLogListener(prisma, cls);

    await listener.handleAuditLogEmit({
      action: 'record.create',
      resourceId: 'rec1',
      operationId: 'op1',
      params: { source: 'smoke' },
      recordCount: 1,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org1',
        actorId: 'usr1',
        action: 'record.create',
        ipAddress: '127.0.0.1',
        requestId: 'req1',
        detail: {
          resourceType: 'record',
          resourceId: 'rec1',
          operationId: 'op1',
          params: { source: 'smoke' },
          payload: { recordCount: 1 },
        },
      }),
    });
  });
});
