/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { AuditAuthService } from './audit.auth.service';
import { clampAuditLimit, formatAuditAction } from './audit.helpers';

interface IMockAuditTable {
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  auditLog: IMockAuditTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  auditLog: {
    findMany: vi.fn(async () => []),
  },
});

describe('AuditAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: AuditAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AuditAuthService(prisma as never);
  });

  it('listAuditOperations returns rows from prisma.auditLog.findMany', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([
      { id: 'a1', action: 'record.create', resourceId: 'r1', userId: 'u1', rootAction: null, operationId: null, createdAt: now },
    ]);
    const out = await svc.listAuditOperations({});
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.action).toBe('record.create');
  });

  it('listAuditOperations filters via matchesAuditFilter when filter is provided', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([
      { id: 'a1', action: 'record.create', resourceId: 'r1', userId: 'u1', rootAction: null, operationId: null, createdAt: now },
      { id: 'a2', action: 'record.update', resourceId: 'r1', userId: 'u1', rootAction: null, operationId: null, createdAt: now },
    ]);
    const out = await svc.listAuditOperations({ action: 'record.create' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.id).toBe('a1');
  });

  it('listAuditOperations handles missing auditLog table (returns empty rows)', async () => {
    const prismaEmpty = {} as unknown as IMockPrisma;
    const svcEmpty = new AuditAuthService(prismaEmpty as never);
    const out = await svcEmpty.listAuditOperations({});
    expect(out.rows).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });

  it('listAuditOperations clamps the requested limit', async () => {
    await svc.listAuditOperations({ limit: 5_000 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1_000 })
    );
  });
});

describe('audit helpers', () => {
  it('formatAuditAction lower-cases and collapses dashes', () => {
    expect(formatAuditAction('Record-Create')).toBe('record.create');
  });

  it('clampAuditLimit returns 100 by default and caps at 1000', () => {
    expect(clampAuditLimit(undefined)).toBe(100);
    expect(clampAuditLimit(0)).toBe(100);
    expect(clampAuditLimit(5000)).toBe(1_000);
    expect(clampAuditLimit(50)).toBe(50);
  });
});
