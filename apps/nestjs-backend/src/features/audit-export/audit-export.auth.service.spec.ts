import { vi } from 'vitest';

import { AuditExportAuthService } from './audit-export.auth.service';

interface IMockAuditEvent {
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockSiemWebhook {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  auditEvent: IMockAuditEvent;
  siemWebhook: IMockSiemWebhook;
}

const buildPrisma = (): IMockPrisma => ({
  auditEvent: {
    findMany: vi.fn(async () => []),
  },
  siemWebhook: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ ...data, id: where.id })),
  },
});

const sampleEvent = () => ({
  id: 'ev1',
  organizationId: 'org_1',
  actorId: 'u1',
  action: 'user.login',
  detail: null,
  ipAddress: '1.2.3.4',
  requestId: 'r1',
  createdTime: new Date('2026-08-25T00:00:00.000Z'),
});

describe('AuditExportAuthService (Stage 24)', () => {
  let prisma: IMockPrisma;
  let svc: AuditExportAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AuditExportAuthService(prisma as never);
  });

  describe('export', () => {
    it('materializes a CSV payload of matching events', async () => {
      prisma.auditEvent.findMany.mockResolvedValueOnce([sampleEvent()]);
      const out = await svc.export({ organizationId: 'org_1', format: 'csv' });
      expect(out.rowCount).toBe(1);
      expect(out.mimeType).toBe('text/csv; charset=utf-8');
      expect(out.body).toContain('user.login');
    });

    it('passes date + actor + action filters through to prisma', async () => {
      const from = new Date('2026-08-01T00:00:00Z');
      const to = new Date('2026-09-01T00:00:00Z');
      await svc.export({
        organizationId: 'org_1',
        format: 'json',
        from,
        to,
        actorId: 'u1',
        action: 'user.login',
      });
      const arg = prisma.auditEvent.findMany.mock.calls[0][0];
      expect(arg.where.organizationId).toBe('org_1');
      expect(arg.where.actorId).toBe('u1');
      expect(arg.where.action).toBe('user.login');
      expect(arg.where.createdTime.gte).toEqual(from);
      expect(arg.where.createdTime.lte).toEqual(to);
      expect(arg.take).toBe(AuditExportAuthService.MAX_EXPORT_ROWS);
    });
  });

  describe('deliverAll', () => {
    it('skips when there are no enabled webhooks', async () => {
      const results = await svc.deliverAll({ organizationId: 'org_1' });
      expect(results).toEqual([]);
    });

    it('fans out to each enabled webhook', async () => {
      prisma.auditEvent.findMany.mockResolvedValueOnce([sampleEvent()]);
      prisma.siemWebhook.findMany.mockResolvedValueOnce([
        {
          id: 'wh1',
          organizationId: 'org_1',
          label: 'A',
          url: 'https://a',
          secret: 's1',
          enabled: true,
          actions: [],
        },
        {
          id: 'wh2',
          organizationId: 'org_1',
          label: 'B',
          url: 'https://b',
          secret: 's2',
          enabled: true,
          actions: [],
        },
      ]);
      prisma.siemWebhook.findUnique.mockImplementation(async ({ where }) => ({
        id: where.id,
        organizationId: 'org_1',
        label: where.id === 'wh1' ? 'A' : 'B',
        url: where.id === 'wh1' ? 'https://a' : 'https://b',
        secret: where.id === 'wh1' ? 's1' : 's2',
        enabled: true,
        actions: [],
      }));
      // Patch global fetch to always succeed.
      const originalFetch = global.fetch;
      global.fetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
      try {
        const results = await svc.deliverAll({ organizationId: 'org_1' });
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.ok)).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('chunk', () => {
    it('splits an array into batches of size N', () => {
      const out = AuditExportAuthService.chunk([1, 2, 3, 4, 5], 2);
      expect(out).toEqual([[1, 2], [3, 4], [5]]);
    });
  });
});
