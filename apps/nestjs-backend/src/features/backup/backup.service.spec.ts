import { BackupService, InMemoryBackupStore } from './backup.service';
import { vi } from 'vitest';
import type { IBackupManifest, MergeMode } from './backup.types';

interface MockStore {
  backupSnapshot: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  backupRestoreLog: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  backupSnapshot: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
  },
  backupRestoreLog: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

const sampleManifest: IBackupManifest = {
  baseId: 'base_1',
  tables: [
    { id: 't1', name: 'Tasks', recordCount: 10 },
    { id: 't2', name: 'Projects', recordCount: 3 },
  ],
  totalRecords: 13,
  payloadBytes: 256,
};

describe('BackupService (Stage 20)', () => {
  let svc: BackupService;
  let store: MockStore;
  let memStore: InMemoryBackupStore;

  beforeEach(() => {
    store = buildPrisma();
    memStore = new InMemoryBackupStore();
    svc = new BackupService(store as never, {
      store: memStore,
      marshaller: async (baseId) => ({ ...sampleManifest, baseId }),
      rowApplier: async (_t, _p, mode) =>
        mode === 'replace' ? sampleManifest.totalRecords : sampleManifest.totalRecords,
    });
  });

  it('createBackup writes a manifest + marks complete', async () => {
    const row = await svc.createBackup({ baseId: 'base_1', createdBy: 'u1' });
    expect(row.status).toBe('complete');
    expect(row.sizeBytes).toBeGreaterThan(0);
    expect(row.manifest?.totalRecords).toBe(13);
    expect(row.archivePath).toMatch(/^mem:\/\/bk_/);
  });

  it('createBackup marks failed when marshaller throws', async () => {
    svc = new BackupService(store as never, {
      store: memStore,
      marshaller: async () => {
        throw new Error('db down');
      },
      rowApplier: async () => 0,
    });
    const row = await svc.createBackup({ baseId: 'base_1', createdBy: 'u1' });
    expect(row.status).toBe('failed');
    expect(row.errorMessage).toMatch(/db down/);
  });

  it('listSnapshots filters by baseId', async () => {
    await svc.listSnapshots('base_1');
    expect(store.backupSnapshot.findMany).toHaveBeenCalledWith({
      where: { baseId: 'base_1' },
      orderBy: { createdTime: 'desc' },
    });
  });

  it('deleteSnapshot removes both row and archive file', async () => {
    store.backupSnapshot.findFirst.mockResolvedValueOnce({
      id: 'bk_1',
      baseId: 'base_1',
      createdBy: 'u1',
      status: 'complete',
      sizeBytes: 100n,
      archivePath: 'mem://bk_1.json.gz',
      manifest: sampleManifest,
      errorMessage: null,
      createdTime: new Date(),
      lastModifiedTime: new Date(),
    });
    // pre-populate the in-memory store so we can verify the file is gone
    await memStore.write('bk_1', Buffer.from('hello'));
    const ok = await svc.deleteSnapshot('bk_1');
    expect(ok).toBe(true);
    expect(store.backupSnapshot.delete).toHaveBeenCalledWith({ where: { id: 'bk_1' } });
    await expect(memStore.read('mem://bk_1.json.gz')).rejects.toThrow(/not found/);
  });

  it('deleteSnapshot returns false when row absent', async () => {
    const ok = await svc.deleteSnapshot('missing');
    expect(ok).toBe(false);
  });

  it('restore rejects invalid mode', async () => {
    await expect(
      svc.restore({ snapshotId: 'bk_1', targetBaseId: 'b2', mode: 'overwrite' as never })
    ).rejects.toThrow(/invalid mode/);
  });

  it('restore rejects when snapshot missing', async () => {
    await expect(
      svc.restore({ snapshotId: 'bk_1', targetBaseId: 'b2', mode: 'merge' })
    ).rejects.toThrow(/snapshot not found/);
  });

  it('restore happy path: rows_restored = totalRecords, status=complete', async () => {
    // pre-create a snapshot row in the in-memory archive so restore can read it
    const archivePath = await memStore.write(
      'bk_1',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Buffer.from('placeholder')
    );
    store.backupSnapshot.findFirst.mockResolvedValueOnce({
      id: 'bk_1',
      baseId: 'base_1',
      createdBy: 'u1',
      status: 'complete',
      sizeBytes: 100n,
      archivePath,
      manifest: sampleManifest,
      errorMessage: null,
      createdTime: new Date(),
      lastModifiedTime: new Date(),
    });
    // Re-create the archive with a real gzipped manifest for restore().
    const { gzipSync } = await import('zlib');
    await memStore.write('bk_1', gzipSync(Buffer.from(JSON.stringify(sampleManifest))));
    const log = await svc.restore({
      snapshotId: 'bk_1',
      targetBaseId: 'base_2',
      mode: 'merge',
    });
    expect(log.status).toBe('complete');
    expect(log.rowsRestored).toBe(13);
  });

  it('restore marks failed when rowApplier throws', async () => {
    svc = new BackupService(store as never, {
      store: memStore,
      marshaller: async (baseId) => ({ ...sampleManifest, baseId }),
      rowApplier: async () => {
        throw new Error('write conflict');
      },
    });
    store.backupSnapshot.findFirst.mockResolvedValueOnce({
      id: 'bk_1',
      baseId: 'base_1',
      createdBy: 'u1',
      status: 'complete',
      sizeBytes: 100n,
      archivePath: 'mem://bk_1.json.gz',
      manifest: sampleManifest,
      errorMessage: null,
      createdTime: new Date(),
      lastModifiedTime: new Date(),
    });
    const { gzipSync } = await import('zlib');
    await memStore.write('bk_1', gzipSync(Buffer.from(JSON.stringify(sampleManifest))));
    const log = await svc.restore({
      snapshotId: 'bk_1',
      targetBaseId: 'base_2',
      mode: 'replace',
    });
    expect(log.status).toBe('failed');
    expect(log.errorMessage).toMatch(/write conflict/);
  });
});
