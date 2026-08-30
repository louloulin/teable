import { describe, expect, it, vi } from 'vitest';

import { AuditLogService } from './audit-log.service';

/**
 * Build a fake PrismaService exposing just the `auditEvent` delegate we
 * touch. Everything else is left unstubbed — the service should never
 * reach for another model.
 */
const buildPrisma = () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const groupBy = vi.fn().mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = { auditEvent: { findMany, count, groupBy } } as any;
  return { prisma, findMany, count, groupBy };
};

describe('AuditLogService', () => {
  it('summarizes filtered events by action in descending count order', async () => {
    const { prisma, count, groupBy } = buildPrisma();
    count.mockResolvedValueOnce(5);
    groupBy.mockResolvedValueOnce([
      { action: 'record.update', _count: { _all: 3 } },
      { action: 'record.create', _count: { _all: 2 } },
    ]);
    const service = new AuditLogService(prisma);

    await expect(service.summary({ actor: 'u1' })).resolves.toEqual({
      total: 5,
      distinctActions: 2,
      perAction: [
        { action: 'record.update', count: 3 },
        { action: 'record.create', count: 2 },
      ],
    });
    expect(count).toHaveBeenCalledWith({ where: { actorId: 'u1' } });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['action'],
      where: { actorId: 'u1' },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
    });
  });

  it('builds a Prisma where clause that maps actor/action/resourceType/since/until to known columns', async () => {
    const { prisma, findMany, count } = buildPrisma();
    const service = new AuditLogService(prisma);

    const since = new Date('2026-08-01T00:00:00.000Z');
    const until = new Date('2026-08-25T23:59:59.000Z');
    await service.query({
      actor: 'u1',
      action: 'user.sso.login.success',
      resourceType: 'user',
      since,
      until,
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    const findArgs = findMany.mock.calls[0][0];
    expect(findArgs).toEqual({
      where: {
        actorId: 'u1',
        action: 'user.sso.login.success',
        detail: { path: ['resourceType'], equals: 'user' },
        createdTime: { gte: since, lte: until },
      },
      skip: 0,
      take: 20,
      orderBy: { createdTime: 'desc' },
    });
    // count() must use the same where so `total` reflects the same row set.
    expect(count).toHaveBeenCalledTimes(1);
    expect(count.mock.calls[0][0]).toEqual({
      where: {
        actorId: 'u1',
        action: 'user.sso.login.success',
        detail: { path: ['resourceType'], equals: 'user' },
        createdTime: { gte: since, lte: until },
      },
    });
  });

  it('paginates with skip = (page - 1) * pageSize and forwards the page size to take', async () => {
    const { prisma, findMany } = buildPrisma();
    const service = new AuditLogService(prisma);

    await service.query({ page: 3, pageSize: 15 });
    expect(findMany.mock.calls[0][0].skip).toBe(30);
    expect(findMany.mock.calls[0][0].take).toBe(15);

    findMany.mockClear();
    await service.query({ page: 1, pageSize: 100 });
    expect(findMany.mock.calls[0][0].skip).toBe(0);
    expect(findMany.mock.calls[0][0].take).toBe(100);

    // defaults
    findMany.mockClear();
    await service.query({});
    expect(findMany.mock.calls[0][0].skip).toBe(0);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it('passes string filters through as exact-match values — no concatenation or SQL injection surface', async () => {
    const { prisma, findMany } = buildPrisma();
    const service = new AuditLogService(prisma);

    const payload = {
      actor: "u1' OR 1=1--",
      action: "user.sso.login.failure'; DROP TABLE audit_log;--",
      resourceType: 'user',
    };
    await service.query(payload);

    expect(findMany).toHaveBeenCalledTimes(1);
    const findArgs = findMany.mock.calls[0][0];
    // Prisma parameterizes every value, so the dangerous payload stays as a
    // single string literal in `where`. We assert the literal shape only —
    // Prisma's own escaping is what protects us from injection.
    expect(findArgs.where).toEqual({
      actorId: "u1' OR 1=1--",
      action: "user.sso.login.failure'; DROP TABLE audit_log;--",
      detail: { path: ['resourceType'], equals: 'user' },
    });
    // Structural sanity: the where clause has no OR operator, no DROP
    // TABLE clause split off as a separate value — the entire payload
    // sits as one string per field.
    const keys = Object.keys(findArgs.where);
    expect(keys).toEqual(['actorId', 'action', 'detail']);
    expect(typeof findArgs.where.actorId).toBe('string');
    expect(typeof findArgs.where.action).toBe('string');
    expect(findArgs.where.detail).toEqual({ path: ['resourceType'], equals: 'user' });
  });

  it('omits createdAt filter when neither since nor until is provided', async () => {
    const { prisma, findMany } = buildPrisma();
    const service = new AuditLogService(prisma);

    await service.query({ actor: 'u1', pageSize: 5 });
    expect(findMany.mock.calls[0][0].where).toEqual({ actorId: 'u1' });
    expect(findMany.mock.calls[0][0].where.createdTime).toBeUndefined();
  });

  it('emits an empty-page result when the table has no rows', async () => {
    const { prisma, findMany, count } = buildPrisma();
    findMany.mockResolvedValueOnce([]);
    count.mockResolvedValueOnce(0);
    const service = new AuditLogService(prisma);

    await expect(service.query({})).resolves.toEqual({ rows: [], total: 0 });
  });

  it('returns rows + total when the table has rows', async () => {
    const { prisma, findMany, count } = buildPrisma();
    const row = {
      id: 'row1',
      actorId: 'u1',
      action: 'user.sso.login.success',
      detail: { resourceType: 'user', resourceId: 'u1', payload: {} },
      createdTime: new Date(),
    };
    findMany.mockResolvedValueOnce([row]);
    count.mockResolvedValueOnce(7);
    const service = new AuditLogService(prisma);

    await expect(service.query({ actor: 'u1' })).resolves.toEqual({
      rows: [
        {
          id: row.id,
          userId: 'u1',
          action: row.action,
          resourceType: 'user',
          resourceId: 'u1',
          payload: {},
          rootAction: null,
          operationId: null,
          createdAt: row.createdTime,
        },
      ],
      total: 7,
    });
  });
});
