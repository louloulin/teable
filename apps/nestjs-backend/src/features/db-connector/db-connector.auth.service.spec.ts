/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DbConnectorAuthService } from './db-connector.auth.service';

interface IMockConnectorRow {
  id: string;
  baseId: string;
  name: string;
  kind: string;
  encryptedConfigJson: string;
  incrementalField: string | null;
  schedule: string;
  targetTableId: string;
  enabled: boolean;
  lastSyncAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}

interface IMockSyncRow {
  id: string;
  connectorId: string;
  mode: string;
  status: string;
  rowsFetched: number;
  rowsWritten: number;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  triggeredBy: string;
}

function mkConnectorRow(over: Partial<IMockConnectorRow> = {}): IMockConnectorRow {
  return {
    id: 'dbc_1',
    baseId: 'b1',
    name: 'pg',
    kind: 'postgres',
    encryptedConfigJson: '{}',
    incrementalField: null,
    schedule: '',
    targetTableId: 't1',
    enabled: true,
    lastSyncAt: null,
    createdTime: new Date('2024-01-01T00:00:00Z'),
    updatedTime: new Date('2024-01-01T00:00:00Z'),
    ...over,
  };
}

function mkSyncRow(over: Partial<IMockSyncRow> = {}): IMockSyncRow {
  return {
    id: 'dbs_1',
    connectorId: 'dbc_1',
    mode: 'manual',
    status: 'success',
    rowsFetched: 100,
    rowsWritten: 100,
    startedAt: new Date('2024-01-01T00:00:00Z'),
    finishedAt: new Date('2024-01-01T00:01:00Z'),
    errorMessage: null,
    triggeredBy: 'u1',
    ...over,
  };
}

function mkPrismaMock() {
  const connectorCreate = vi.fn();
  const connectorFindMany = vi.fn();
  const connectorFindUnique = vi.fn();
  const connectorUpdate = vi.fn();
  const connectorDelete = vi.fn();
  const syncCreate = vi.fn();
  const syncFindMany = vi.fn();
  const syncFindUnique = vi.fn();
  const syncFindFirst = vi.fn();
  const syncUpdate = vi.fn();

  const prisma = {
    dbConnector: {
      create: connectorCreate,
      findMany: connectorFindMany,
      findUnique: connectorFindUnique,
      update: connectorUpdate,
      delete: connectorDelete,
    },
    dbConnectorSync: {
      create: syncCreate,
      findMany: syncFindMany,
      findUnique: syncFindUnique,
      findFirst: syncFindFirst,
      update: syncUpdate,
    },
  } as unknown as PrismaService;

  return {
    prisma,
    mocks: {
      connectorCreate,
      connectorFindMany,
      connectorFindUnique,
      connectorUpdate,
      connectorDelete,
      syncCreate,
      syncFindMany,
      syncFindUnique,
      syncFindFirst,
      syncUpdate,
    },
  };
}

describe('DbConnectorAuthService', () => {
  describe('createConnector', () => {
    it('persists a valid connector and returns the parsed shape', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorCreate.mockResolvedValue(mkConnectorRow({ id: 'dbc_new', name: 'pg-main' }));
      const svc = new DbConnectorAuthService(prisma);

      const out = await svc.createConnector({
        baseId: 'b1',
        name: 'pg-main',
        kind: 'postgres',
        config: { host: 'h', port: 5432, database: 'd', user: 'u', password: 'p' },
        targetTableId: 't1',
      });
      expect(out.id).toBe('dbc_new');
      expect(out.kind).toBe('postgres');
      expect(out.enabled).toBe(true);
      expect(mocks.connectorCreate).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid kind without hitting prisma', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const svc = new DbConnectorAuthService(prisma);
      await expect(
        svc.createConnector({
          baseId: 'b1',
          name: 'x',
          kind: 'wat' as never,
          config: {},
        })
      ).rejects.toThrow(/kind/);
      expect(mocks.connectorCreate).not.toHaveBeenCalled();
    });

    it('rejects missing config keys without hitting prisma', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const svc = new DbConnectorAuthService(prisma);
      await expect(
        svc.createConnector({
          baseId: 'b1',
          name: 'pg',
          kind: 'postgres',
          config: { host: 'h' },
        })
      ).rejects.toThrow(/port|database|user|password/);
      expect(mocks.connectorCreate).not.toHaveBeenCalled();
    });
  });

  describe('listConnectors', () => {
    it('scopes by baseId and optionally by kind', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindMany.mockResolvedValue([mkConnectorRow()]);
      const svc = new DbConnectorAuthService(prisma);

      await svc.listConnectors('b1');
      expect(mocks.connectorFindMany).toHaveBeenCalledWith({ where: { baseId: 'b1' } });

      await svc.listConnectors('b1', 'postgres');
      expect(mocks.connectorFindMany).toHaveBeenLastCalledWith({
        where: { baseId: 'b1', kind: 'postgres' },
      });
    });
  });

  describe('getConnector', () => {
    it('returns the parsed connector', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow({ id: 'dbc_x' }));
      const svc = new DbConnectorAuthService(prisma);
      const out = await svc.getConnector('dbc_x');
      expect(out.id).toBe('dbc_x');
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.getConnector('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateConnector', () => {
    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.updateConnector('nope', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(mocks.connectorUpdate).not.toHaveBeenCalled();
    });

    it('rejects empty name', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.updateConnector('dbc_1', { name: '   ' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('serializes config to encryptedConfigJson when patching', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow());
      mocks.connectorUpdate.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);
      await svc.updateConnector('dbc_1', { config: { host: 'h2' } });
      const call = mocks.connectorUpdate.mock.calls[0][0];
      expect(call.data.encryptedConfigJson).toBe('{"host":"h2"}');
    });
  });

  describe('deleteConnector', () => {
    it('deletes when present', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);
      await svc.deleteConnector('dbc_1');
      expect(mocks.connectorDelete).toHaveBeenCalledWith({ where: { id: 'dbc_1' } });
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.deleteConnector('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.connectorDelete).not.toHaveBeenCalled();
    });
  });

  describe('startSync', () => {
    it('throws NotFound when connector missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      await expect(
        svc.startSync({ connectorId: 'nope', triggeredBy: 'u1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses when last sync is still running', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow());
      mocks.syncFindFirst.mockResolvedValue(mkSyncRow({ status: 'running' }));
      const svc = new DbConnectorAuthService(prisma);
      await expect(
        svc.startSync({ connectorId: 'dbc_1', triggeredBy: 'u1' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.syncCreate).not.toHaveBeenCalled();
    });

    it('creates a running sync and returns it', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.connectorFindUnique.mockResolvedValue(mkConnectorRow());
      mocks.syncFindFirst.mockResolvedValue(undefined);
      mocks.syncCreate.mockResolvedValue(mkSyncRow({ id: 'dbs_new', status: 'running' }));
      const svc = new DbConnectorAuthService(prisma);

      const out = await svc.startSync({
        connectorId: 'dbc_1',
        triggeredBy: 'u1',
        mode: 'incremental',
      });
      expect(out.status).toBe('running');
      expect(mocks.syncCreate).toHaveBeenCalledTimes(1);
      const call = mocks.syncCreate.mock.calls[0][0];
      expect(call.data.mode).toBe('incremental');
      expect(call.data.triggeredBy).toBe('u1');
    });
  });

  describe('finishSync', () => {
    it('throws when sync not running', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'success' }));
      const svc = new DbConnectorAuthService(prisma);
      await expect(
        svc.finishSync('dbs_1', { rowsFetched: 10, rowsWritten: 10 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes success status and updates lastSyncAt', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'running' }));
      mocks.syncUpdate.mockResolvedValue(mkSyncRow({ status: 'success' }));
      mocks.connectorUpdate.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);

      const out = await svc.finishSync('dbs_1', { rowsFetched: 50, rowsWritten: 50 });
      expect(out.status).toBe('success');
      expect(mocks.connectorUpdate).toHaveBeenCalled();
    });

    it('writes failed status when error present', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'running' }));
      mocks.syncUpdate.mockResolvedValue(
        mkSyncRow({ status: 'failed', errorMessage: 'connection refused' })
      );
      mocks.connectorUpdate.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);

      const out = await svc.finishSync('dbs_1', {
        rowsFetched: 0,
        rowsWritten: 0,
        error: 'connection refused',
      });
      expect(out.status).toBe('failed');
      expect(out.errorMessage).toBe('connection refused');
    });

    it('writes partial status when rowsWritten < rowsFetched', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'running' }));
      mocks.syncUpdate.mockResolvedValue(mkSyncRow({ status: 'partial' }));
      mocks.connectorUpdate.mockResolvedValue(mkConnectorRow());
      const svc = new DbConnectorAuthService(prisma);

      const out = await svc.finishSync('dbs_1', { rowsFetched: 10, rowsWritten: 5 });
      expect(out.status).toBe('partial');
    });
  });

  describe('cancelSync', () => {
    it('cancels a running sync', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'running' }));
      mocks.syncUpdate.mockResolvedValue(mkSyncRow({ status: 'cancelled' }));
      const svc = new DbConnectorAuthService(prisma);
      const out = await svc.cancelSync('dbs_1');
      expect(out.status).toBe('cancelled');
    });

    it('rejects when sync not running', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(mkSyncRow({ status: 'success' }));
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.cancelSync('dbs_1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listSyncs + getSync + lastSyncFor', () => {
    it('queries with orderBy desc + take limit', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindMany.mockResolvedValue([mkSyncRow()]);
      const svc = new DbConnectorAuthService(prisma);
      await svc.listSyncs('dbc_1', 25);
      expect(mocks.syncFindMany).toHaveBeenCalledWith({
        where: { connectorId: 'dbc_1' },
        orderBy: { startedAt: 'desc' },
        take: 25,
      });
    });

    it('getSync throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindUnique.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      await expect(svc.getSync('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lastSyncFor returns undefined when none', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindFirst.mockResolvedValue(null);
      const svc = new DbConnectorAuthService(prisma);
      expect(await svc.lastSyncFor('dbc_1')).toBeUndefined();
    });

    it('lastSyncFor returns the parsed sync', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.syncFindFirst.mockResolvedValue(mkSyncRow());
      const svc = new DbConnectorAuthService(prisma);
      const out = await svc.lastSyncFor('dbc_1');
      expect(out?.status).toBe('success');
    });
  });

  describe('exposed helpers', () => {
    it('exposes isValidKind/isValidSyncMode/isManualRunAllowed', () => {
      const { prisma } = mkPrismaMock();
      const svc = new DbConnectorAuthService(prisma);
      expect(svc.isValidKind('mysql')).toBe(true);
      expect(svc.isValidSyncMode('full')).toBe(true);
      expect(svc.isManualRunAllowed(undefined)).toBe(true);
    });
  });
});
