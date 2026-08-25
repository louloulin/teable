/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { GoogleSheetsSyncAuthService } from './google-sheets-sync.auth.service';

interface IMockConn {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockMapping {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockSyncRecord {
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockSyncLog {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockChannel {
  upsert: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  googleSheetsConnection: IMockConn;
  googleSheetsMapping: IMockMapping;
  googleSheetsSyncRecord: IMockSyncRecord;
  googleSheetsSyncLog: IMockSyncLog;
  googleSheetsWebhookChannel: IMockChannel;
}

const buildPrisma = (): IMockPrisma => ({
  googleSheetsConnection: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      connectedTime: new Date(),
      updatedTime: new Date(),
      revokedAt: null,
    })),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  googleSheetsMapping: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      status: 'ready',
      lastSyncedTime: null,
      lastErrorMessage: null,
      createdTime: new Date(),
    })),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
  },
  googleSheetsSyncRecord: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      localUpdatedAt: null,
      remoteUpdatedAt: null,
      lastSyncedAt: new Date(),
    })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  googleSheetsSyncLog: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      rowsRead: 0,
      rowsWritten: 0,
      conflictsResolved: 0,
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    })),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  googleSheetsWebhookChannel: {
    upsert: vi.fn(async () => undefined),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new GoogleSheetsSyncAuthService(prisma as never);
  return { svc, prisma };
};

describe('GoogleSheetsSyncAuthService (Stage 37)', () => {
  it('connect creates a connection with hashed refresh token', async () => {
    const { svc, prisma } = buildSvc();
    const c = await svc.connect({
      organizationId: 'o',
      baseId: 'b',
      spreadsheetId: 'ss1',
      spreadsheetTitle: 'My Sheet',
      refreshToken: 'super-secret-token',
      connectedBy: 'u1',
    });
    expect(c.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(c.refreshTokenHash).not.toContain('super-secret');
    expect(prisma.googleSheetsConnection.create).toHaveBeenCalledTimes(1);
  });

  it('connect rejects empty refresh token', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.connect({
        organizationId: 'o',
        baseId: 'b',
        spreadsheetId: 'ss',
        spreadsheetTitle: 'T',
        refreshToken: 'x',
        connectedBy: 'u1',
      })
    ).rejects.toThrow();
  });

  it('connect rejects duplicate spreadsheet connection', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsConnection.findFirst.mockResolvedValueOnce({ revokedAt: null } as never);
    await expect(
      svc.connect({
        organizationId: 'o',
        baseId: 'b',
        spreadsheetId: 'ss',
        spreadsheetTitle: 'T',
        refreshToken: 'long-enough',
        connectedBy: 'u1',
      })
    ).rejects.toThrow(/already connected/);
  });

  it('revoke sets revokedAt', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsConnection.findUnique.mockResolvedValueOnce({ id: 'c1' } as never);
    await svc.revoke('c1');
    expect(prisma.googleSheetsConnection.update).toHaveBeenCalledTimes(1);
  });

  it('revoke throws on missing connection', async () => {
    const { svc } = buildSvc();
    await expect(svc.revoke('missing')).rejects.toThrow();
  });

  it('createMapping validates direction', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsConnection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      revokedAt: null,
    } as never);
    const m = await svc.createMapping({
      connectionId: 'c1',
      sheetId: 'sid',
      sheetTitle: 'Sheet1',
      sheetGid: 0,
      teableBaseId: 'b',
      teableTableId: 't',
      direction: 'bi-directional',
      fieldMap: { Name: 'fld_1' },
    });
    expect(m.fieldMapHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.googleSheetsMapping.create).toHaveBeenCalledTimes(1);
  });

  it('createMapping rejects invalid direction', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createMapping({
        connectionId: 'c1',
        sheetId: 's',
        sheetTitle: 'T',
        sheetGid: 0,
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'mystery' as never,
        fieldMap: {},
      })
    ).rejects.toThrow();
  });

  it('createMapping rejects revoked connection', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsConnection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      revokedAt: new Date(),
    } as never);
    await expect(
      svc.createMapping({
        connectionId: 'c1',
        sheetId: 's',
        sheetTitle: 'T',
        sheetGid: 0,
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'bi-directional',
        fieldMap: {},
      })
    ).rejects.toThrow();
  });

  it('createMapping rejects duplicate sheet id', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsConnection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      revokedAt: null,
    } as never);
    prisma.googleSheetsMapping.findFirst.mockResolvedValueOnce({ id: 'm1' } as never);
    await expect(
      svc.createMapping({
        connectionId: 'c1',
        sheetId: 'sid',
        sheetTitle: 'T',
        sheetGid: 0,
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'bi-directional',
        fieldMap: {},
      })
    ).rejects.toThrow(/sheet mapping exists/);
  });

  it('updateMappingDirection patches direction', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsMapping.findUnique.mockResolvedValueOnce({ id: 'm1' } as never);
    await svc.updateMappingDirection('m1', 'one-way-push');
    expect(prisma.googleSheetsMapping.update).toHaveBeenCalledTimes(1);
  });

  it('updateMappingStatus enforces state machine', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsMapping.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'ready',
    } as never);
    const m = await svc.updateMappingStatus('m1', 'paused');
    expect(m.status).toBe('paused');
    prisma.googleSheetsMapping.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'ready',
    } as never);
    await expect(svc.updateMappingStatus('m1', 'ready')).rejects.toThrow();
  });

  it('deleteMapping cascades records then mapping', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsMapping.findUnique.mockResolvedValueOnce({ id: 'm1' } as never);
    await svc.deleteMapping('m1');
    expect(prisma.googleSheetsSyncRecord.deleteMany).toHaveBeenCalledWith({
      where: { mappingId: 'm1' },
    });
    expect(prisma.googleSheetsMapping.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('listMappings filters by teableBaseId', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsMapping.findMany.mockResolvedValueOnce([{ id: 'm1' }] as never);
    const out = await svc.listMappings('b1');
    expect(out).toHaveLength(1);
    expect(prisma.googleSheetsMapping.findMany).toHaveBeenCalledWith({
      where: { teableBaseId: 'b1' },
    });
  });

  it('upsertSyncRecord creates a record', async () => {
    const { svc, prisma } = buildSvc();
    prisma.googleSheetsMapping.findUnique.mockResolvedValueOnce({ id: 'm1' } as never);
    const r = await svc.upsertSyncRecord({
      mappingId: 'm1',
      record: { recordId: 'rec_1', sheetsRowNumber: 5, state: 'synced' },
    });
    expect(r.state).toBe('synced');
    expect(prisma.googleSheetsSyncRecord.create).toHaveBeenCalledTimes(1);
  });

  it('startSyncRun / finishSyncRun roundtrip', async () => {
    const { svc, prisma } = buildSvc();
    const run = await svc.startSyncRun('m1', 'push');
    expect(run.status).toBe('ok');
    prisma.googleSheetsSyncLog.findUnique.mockResolvedValueOnce({ id: run.id } as never);
    const done = await svc.finishSyncRun({
      runId: run.id,
      status: 'partial',
      rowsRead: 10,
      rowsWritten: 7,
      conflictsResolved: 2,
      errorMessage: 'partial: timeout',
    });
    expect(done.status).toBe('partial');
    expect(done.rowsRead).toBe(10);
  });

  it('registerChannel upserts a webhook channel', async () => {
    const { svc, prisma } = buildSvc();
    const ch = await svc.registerChannel({
      resourceId: 'res-1',
      expiration: 1_700_000_000_000,
      mappingId: 'm1',
      connectionId: 'c1',
    });
    expect(ch.id).toMatch(/^gsheets-/);
    expect(prisma.googleSheetsWebhookChannel.upsert).toHaveBeenCalledTimes(1);
  });

  it('exposes deriveAllowedMutations / resolveConflict / foldRun helpers', () => {
    const { svc } = buildSvc();
    expect(svc.deriveAllowedMutations('one-way-pull').canPushLocalToRemote).toBe(false);
    expect(
      svc.resolveConflict({
        localUpdatedAt: new Date('2026-08-25T01:00:00Z'),
        remoteUpdatedAt: new Date('2026-08-25T02:00:00Z'),
      }).winner
    ).toBe('remote');
    expect(svc.foldRun({ records: [{ state: 'local-only' }], hadFailure: false }).pushed).toBe(1);
  });
});
