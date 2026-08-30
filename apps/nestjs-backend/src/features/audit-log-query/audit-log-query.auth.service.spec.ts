/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { AuditLogQueryAuthService } from './audit-log-query.auth.service';

interface IMockAuditRow {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  tableId: string | null;
  createdTime: Date;
  ip: string | null;
}

function mkRow(over: Partial<IMockAuditRow> = {}): IMockAuditRow {
  return {
    id: 'ev_1',
    actorId: 'user_1',
    actorType: 'user',
    action: 'record.update',
    resourceType: 'record',
    resourceId: 'rec_1',
    tableId: 'tbl_1',
    createdTime: new Date('2024-06-01T00:00:00Z'),
    ip: '10.0.0.1',
    ...over,
  };
}

function mkPrismaMock() {
  const findMany = vi.fn();
  const prisma = {
    auditEvent: { findMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { findMany } };
}

describe('AuditLogQueryAuthService', () => {
  describe('query', () => {
    it('returns filtered rows', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([
        mkRow({ id: 'e1', actorId: 'user_1' }),
        mkRow({ id: 'e2', actorId: 'user_2' }),
      ]);
      const svc = new AuditLogQueryAuthService(prisma);
      const out = await svc.query({
        where: { field: 'actorId', op: 'eq', value: 'user_1' },
      });
      expect(out.rows).toHaveLength(1);
      expect(out.total).toBe(1);
    });

    it('rejects invalid query', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new AuditLogQueryAuthService(prisma);
      await expect(
        svc.query({ where: { field: 'unknown' as never, op: 'eq', value: 'x' } })
      ).rejects.toThrow();
    });
  });

  describe('buildSql', () => {
    it('returns SQL + params', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new AuditLogQueryAuthService(prisma);
      const out = await svc.buildSql({
        where: { field: 'actorId', op: 'eq', value: 'user_1' },
      });
      expect(out.sql).toContain('"actor_id"');
      expect(out.params).toEqual(['user_1']);
    });
  });
});
