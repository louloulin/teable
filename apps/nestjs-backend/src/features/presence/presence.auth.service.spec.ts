/* eslint-disable @typescript-eslint/naming-convention */
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { PresenceAuthService } from './presence.auth.service';

interface IMockSessionRow {
  id: string;
  baseId: string;
  scope: string;
  scopeId: string;
  userId: string;
  color: string;
  displayName: string;
  status: string;
  cursorJson: string | null;
  lastHeartbeatAt: Date;
  expiresAt: Date;
  connectedAt: Date;
}

function mkSessionRow(over: Partial<IMockSessionRow> = {}): IMockSessionRow {
  const now = new Date('2024-01-01T00:00:00Z');
  return {
    id: 'ps_1',
    baseId: 'b1',
    scope: 'base',
    scopeId: 'b1',
    userId: 'u1',
    color: '#3b82f6',
    displayName: 'Alice',
    status: 'active',
    cursorJson: null,
    lastHeartbeatAt: now,
    expiresAt: new Date(now.getTime() + 30_000),
    connectedAt: now,
    ...over,
  };
}

function mkPrismaMock() {
  const create = vi.fn();
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();
  const deleteMany = vi.fn();

  const prisma = {
    presenceSession: {
      create,
      findMany,
      findUnique,
      update,
      delete: deleteFn,
      deleteMany,
    },
  } as unknown as PrismaService;

  return {
    prisma,
    mocks: { create, findMany, findUnique, update, deleteFn, deleteMany },
  };
}

describe('PresenceAuthService', () => {
  describe('join', () => {
    it('persists a new session', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([]);
      mocks.create.mockResolvedValue(mkSessionRow({ id: 'ps_new' }));
      const svc = new PresenceAuthService(prisma);

      const out = await svc.join({
        baseId: 'b1',
        scope: 'base',
        scopeId: 'b1',
        userId: 'u1',
        color: '#3b82f6',
        displayName: 'Alice',
      });
      expect(out.id).toBe('ps_new');
      expect(out.status).toBe('active');
      expect(mocks.create).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid input', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new PresenceAuthService(prisma);
      await expect(
        svc.join({
          baseId: '',
          scope: 'base',
          scopeId: 'b1',
          userId: 'u1',
          color: '#3b82f6',
          displayName: 'Alice',
        })
      ).rejects.toThrow();
    });

    it('drops oldest sessions when user exceeds join policy', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const old1 = mkSessionRow({
        id: 'a',
        userId: 'u1',
        connectedAt: new Date('2024-01-01T00:00:00Z'),
      });
      const old2 = mkSessionRow({
        id: 'b',
        userId: 'u1',
        connectedAt: new Date('2024-01-01T00:00:01Z'),
      });
      const old3 = mkSessionRow({
        id: 'c',
        userId: 'u1',
        connectedAt: new Date('2024-01-01T00:00:02Z'),
      });
      mocks.findMany.mockResolvedValue([old1, old2, old3]);
      mocks.deleteMany.mockResolvedValue({ count: 1 });
      mocks.create.mockResolvedValue(mkSessionRow({ id: 'ps_new' }));
      const svc = new PresenceAuthService(prisma);

      await svc.join({
        baseId: 'b1',
        scope: 'base',
        scopeId: 'b1',
        userId: 'u1',
        color: '#3b82f6',
        displayName: 'Alice',
      });
      expect(mocks.deleteMany).toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('deletes the session when present', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkSessionRow());
      const svc = new PresenceAuthService(prisma);
      await svc.leave('ps_1');
      expect(mocks.deleteFn).toHaveBeenCalledWith({ where: { id: 'ps_1' } });
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new PresenceAuthService(prisma);
      await expect(svc.leave('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateCursor', () => {
    it('persists cursor JSON and updates expiresAt', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkSessionRow());
      mocks.update.mockResolvedValue(
        mkSessionRow({ cursorJson: JSON.stringify({ tableId: 't1', rowIndex: 5, fieldId: 'f1' }) })
      );
      const svc = new PresenceAuthService(prisma);

      const out = await svc.updateCursor({
        sessionId: 'ps_1',
        cursor: { tableId: 't1', rowIndex: 5, fieldId: 'f1' },
      });
      expect(out.cursor?.rowIndex).toBe(5);
      expect(out.cursor?.tableId).toBe('t1');
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new PresenceAuthService(prisma);
      await expect(
        svc.updateCursor({
          sessionId: 'nope',
          cursor: { tableId: 't1', rowIndex: 0, fieldId: 'f1' },
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('persists the new status', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkSessionRow({ status: 'active' }));
      mocks.update.mockResolvedValue(mkSessionRow({ status: 'idle' }));
      const svc = new PresenceAuthService(prisma);
      const out = await svc.updateStatus({ sessionId: 'ps_1', status: 'idle' });
      expect(out.status).toBe('idle');
    });

    it('rejects invalid status without hitting prisma', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const svc = new PresenceAuthService(prisma);
      await expect(
        svc.updateStatus({ sessionId: 'ps_1', status: 'busy' as never })
      ).rejects.toThrow(/status/);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe('tick', () => {
    it('updates heartbeat + expiresAt, derives status when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkSessionRow());
      mocks.update.mockResolvedValue(mkSessionRow({ status: 'active' }));
      const svc = new PresenceAuthService(prisma);
      const out = await svc.tick({ sessionId: 'ps_1' });
      expect(out.status).toBe('active');
    });

    it('uses the override status when provided', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkSessionRow());
      mocks.update.mockResolvedValue(mkSessionRow({ status: 'away' }));
      const svc = new PresenceAuthService(prisma);
      const out = await svc.tick({ sessionId: 'ps_1', status: 'away' });
      expect(out.status).toBe('away');
    });
  });

  describe('getSession + listForBase', () => {
    it('getSession throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new PresenceAuthService(prisma);
      await expect(svc.getSession('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listForBase filters expired sessions', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const now = new Date('2024-01-01T00:01:00Z');
      mocks.findMany.mockResolvedValue([
        mkSessionRow({ id: 'live', expiresAt: new Date('2024-01-01T00:02:00Z') }),
        mkSessionRow({ id: 'expired', expiresAt: new Date('2024-01-01T00:00:30Z') }),
      ]);
      const svc = new PresenceAuthService(prisma);
      const out = await svc.listForBase({ baseId: 'b1' }, now);
      expect(out.map((s) => s.id)).toEqual(['live']);
    });

    it('listForBase passes scope + scopeId to prisma', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([]);
      const svc = new PresenceAuthService(prisma);
      await svc.listForBase({ baseId: 'b1', scope: 'table', scopeId: 't1' });
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { baseId: 'b1', scope: 'table', scopeId: 't1' },
      });
    });
  });

  describe('purgeExpired', () => {
    it('returns the number of removed sessions', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deleteMany.mockResolvedValue({ count: 7 });
      const svc = new PresenceAuthService(prisma);
      const out = await svc.purgeExpired();
      expect(out).toBe(7);
      expect(mocks.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) as unknown as Date } },
      });
    });
  });

  describe('exposed helpers', () => {
    it('exposes isValidStatus/filterByQuery/liveSessions', () => {
      const { prisma } = mkPrismaMock();
      const svc = new PresenceAuthService(prisma);
      expect(svc.isValidStatus('active')).toBe(true);
      const sessions = [
        mkSessionRow({ baseId: 'b1', expiresAt: new Date('2024-01-01T00:02:00Z') }),
      ].map((r) => ({
        id: r.id,
        baseId: r.baseId,
        scope: r.scope as 'base',
        scopeId: r.scopeId,
        userId: r.userId,
        color: r.color,
        displayName: r.displayName,
        status: r.status as 'active',
        lastHeartbeatAt: r.lastHeartbeatAt,
        expiresAt: r.expiresAt,
        connectedAt: r.connectedAt,
      }));
      expect(svc.filterByQuery(sessions, { baseId: 'b1' })).toHaveLength(1);
      expect(svc.liveSessions(sessions, new Date('2024-01-01T00:01:00Z'))).toHaveLength(1);
    });
  });
});
