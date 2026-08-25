/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { AirtableSyncAuthService } from './airtable-sync.auth.service';

interface IMockConnectionTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockMappingTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockSyncRecordTable {
  upsert: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockSyncLogTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  airtableConnection: IMockConnectionTable;
  airtableTableMapping: IMockMappingTable;
  airtableSyncRecord: IMockSyncRecordTable;
  airtableSyncLog: IMockSyncLogTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  airtableConnection: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      connectedTime: now,
      updatedTime: now,
      revokedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  airtableTableMapping: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      lastSyncedTime: null,
      lastErrorMessage: null,
      createdTime: now,
      updatedTime: now,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  airtableSyncRecord: {
    upsert: vi.fn(async ({ create, update, where }) => {
      const id = (where as { id: string }).id;
      return {
        id,
        mappingId: (create as { mappingId: string }).mappingId,
        airtableRecordId: (create as { airtableRecordId: string }).airtableRecordId,
        teableRecordId: (create as { teableRecordId: string }).teableRecordId,
        state: (update as { state: string }).state,
        lastRemoteVersion: (update as { lastRemoteVersion: number | null }).lastRemoteVersion,
        lastLocalVersion: (update as { lastLocalVersion: number | null }).lastLocalVersion,
        lastSyncedAt: now,
        lastHash: (update as { lastHash: string | null }).lastHash,
      };
    }),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  airtableSyncLog: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      recordsExamined: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      conflictsFound: 0,
      status: 'ok',
      errorMessage: null,
      startedAt: now,
      finishedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, finishedAt: now })),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
});

describe('AirtableSyncAuthService (Stage 36)', () => {
  let prisma: IMockPrisma;
  let svc: AirtableSyncAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AirtableSyncAuthService(prisma as never);
  });

  describe('connect / revoke', () => {
    it('creates a connection', async () => {
      const c = await svc.connect({
        organizationId: 'o',
        baseId: 'app123',
        baseName: 'My Base',
        accessTokenJson: 'tok',
        connectedBy: 'u',
      });
      expect(c.baseId).toBe('app123');
    });

    it('rejects duplicate connection', async () => {
      prisma.airtableConnection.findUnique.mockResolvedValueOnce({ id: 'x' });
      await expect(
        svc.connect({
          organizationId: 'o',
          baseId: 'app',
          baseName: 'X',
          accessTokenJson: 't',
          connectedBy: 'u',
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('revoke marks revokedAt', async () => {
      prisma.airtableConnection.findUnique.mockResolvedValueOnce({
        id: 'c',
        organizationId: 'o',
        baseId: 'app',
        baseName: 'X',
        accessTokenJson: 't',
        grantedScopes: null,
        connectedBy: 'u',
        connectedTime: now,
        updatedTime: now,
        revokedAt: null,
      });
      const out = await svc.revoke('o', 'app');
      expect(out).toBeDefined();
    });

    it('revoke throws on missing', async () => {
      await expect(svc.revoke('o', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createMapping', () => {
    it('creates a mapping', async () => {
      const m = await svc.createMapping({
        connectionId: 'c',
        airtableTableId: 'atbl',
        airtableTableName: 'Projects',
        teableBaseId: 'b',
        teableTableId: 'tbl',
        fieldMap: { Name: 'fld_1' },
      });
      expect(m.direction).toBe('bi-directional');
      expect(m.status).toBe('ready');
    });

    it('rejects invalid direction', async () => {
      await expect(
        svc.createMapping({
          connectionId: 'c',
          airtableTableId: 'a',
          airtableTableName: 'X',
          teableBaseId: 'b',
          teableTableId: 't',
          direction: 'invalid' as never,
          fieldMap: {},
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate airtable table mapping', async () => {
      prisma.airtableTableMapping.findUnique.mockResolvedValueOnce({ id: 'm' });
      await expect(
        svc.createMapping({
          connectionId: 'c',
          airtableTableId: 'a',
          airtableTableName: 'X',
          teableBaseId: 'b',
          teableTableId: 't',
          fieldMap: {},
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateMapping / deleteMapping', () => {
    it('updates status with valid transition', async () => {
      prisma.airtableTableMapping.findUnique.mockResolvedValueOnce({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'a',
        airtableTableName: 'X',
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'bi-directional',
        status: 'ready',
        fieldMapJson: '{}',
        fieldMapHash: 'h',
        lastSyncedTime: null,
        lastErrorMessage: null,
        createdTime: now,
        updatedTime: now,
      });
      const out = await svc.updateMapping('m', { status: 'paused' });
      expect(out.status).toBe('paused');
    });

    it('rejects invalid status transition', async () => {
      prisma.airtableTableMapping.findUnique.mockResolvedValueOnce({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'a',
        airtableTableName: 'X',
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'bi-directional',
        status: 'ready',
        fieldMapJson: '{}',
        fieldMapHash: 'h',
        lastSyncedTime: null,
        lastErrorMessage: null,
        createdTime: now,
        updatedTime: now,
      });
      await expect(svc.updateMapping('m', { status: 'ready' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('throws on missing mapping', async () => {
      await expect(svc.updateMapping('missing', { status: 'paused' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('deleteMapping removes child rows', async () => {
      prisma.airtableTableMapping.findUnique.mockResolvedValueOnce({ id: 'm' });
      await svc.deleteMapping('m');
      expect(prisma.airtableSyncRecord.deleteMany).toHaveBeenCalledWith({
        where: { mappingId: 'm' },
      });
      expect(prisma.airtableSyncLog.deleteMany).toHaveBeenCalledWith({ where: { mappingId: 'm' } });
    });
  });

  describe('sync records + logs', () => {
    it('upsertSyncRecord creates a deterministic id', async () => {
      const r = await svc.upsertSyncRecord({
        mappingId: 'm',
        airtableRecordId: 'ar',
        teableRecordId: 'lr',
        state: 'synced',
        remoteVersion: 3,
        localVersion: 3,
        contentHash: 'h',
      });
      expect(r.id).toMatch(/^[a-f0-9]{24}$/);
    });

    it('startSyncRun / finishSyncRun', async () => {
      const run = await svc.startSyncRun({ mappingId: 'm', direction: 'pull' });
      expect(run.direction).toBe('pull');
      const finished = await svc.finishSyncRun({
        runId: run.id,
        recordsExamined: 10,
        recordsCreated: 2,
        recordsUpdated: 3,
        conflictsFound: 1,
        status: 'partial',
      });
      expect(finished.recordsExamined).toBe(10);
      expect(finished.status).toBe('partial');
    });
  });

  describe('pure-helper passthroughs', () => {
    it('resolveConflict returns remote win', () => {
      const r = svc.resolveConflict({
        airtableRecordId: 'a',
        teableRecordId: 't',
        remoteVersion: 5,
        localVersion: 3,
        contentHash: 'h',
      });
      expect(r.winner).toBe('remote');
    });

    it('foldSyncRecords returns zero summary', () => {
      expect(svc.foldSyncRecords([]).total).toBe(0);
    });

    it('buildSyncRecordId matches pure helper', () => {
      expect(
        svc.buildSyncRecordId({ mappingId: 'm', airtableRecordId: 'a', teableRecordId: 't' })
      ).toMatch(/^[a-f0-9]{24}$/);
    });
  });
});
