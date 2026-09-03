/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Backup — real roundtrip drill (R55).
 *
 * Spins up the actual `FsBackupStore` against a per-test temp directory
 * and walks the full hot-path: build envelope -> write to disk ->
 * read back -> verify checksum -> decrypt -> restore -> cross-tenant
 * guard.
 *
 * License: AGPL-3.0
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertRestoreTargetAllowed,
  deriveBackupKey,
  unwrapFromArchive,
  wrapForArchive,
  type IBackupEnvelope,
} from './backup-integrity';
import { BackupService, FsBackupStore, InMemoryBackupStore } from './backup.service';
import type { IBackupManifest } from './backup.types';

function mkTempDir(): string {
  return path.join(
    os.tmpdir(),
    `teable-backup-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function mkManifest(): IBackupManifest {
  return {
    baseId: 'base1',
    tables: [
      { id: 'tbl_orders', name: 'Orders', recordCount: 3 },
      { id: 'tbl_users', name: 'Users', recordCount: 2 },
    ],
    totalRecords: 5,
    payloadBytes: 0,
  };
}

function mkPayload(): Uint8Array {
  return gzipSync(
    JSON.stringify({
      tables: [
        { id: 'tbl_orders', records: [{ id: 'r1', fields: { total: 100 } }, { id: 'r2', fields: { total: 200 } }, { id: 'r3', fields: { total: 300 } }] },
        { id: 'tbl_users', records: [{ id: 'u1', fields: { name: 'alice' } }, { id: 'u2', fields: { name: 'bob' } }] },
      ],
    })
  );
}

describe('Backup — real roundtrip drill (R55)', () => {
  let tempDir: string;
  const key = deriveBackupKey('r55-drill-key');

  beforeEach(async () => {
    tempDir = mkTempDir();
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('writes an encrypted envelope to FsBackupStore and reads it back', async () => {
    const store = new FsBackupStore(tempDir);
    const manifest = mkManifest();
    const payload = mkPayload();

    const envelope = wrapForArchive({ manifest, payload }, key);
    const fp = await store.write('snap_001', Buffer.from(JSON.stringify(envelope)));
    expect(fp).toBe(path.join(tempDir, 'snap_001.json.gz'));

    // Read raw bytes back from disk
    const raw = await store.read(fp);
    const restored = JSON.parse(Buffer.from(raw).toString('utf8')) as IBackupEnvelope;

    // Verify the on-disk envelope is the encrypted form (not plaintext)
    expect(restored.ciphertext).toBe(envelope.ciphertext);
    expect(restored.ciphertext).not.toContain('alice');
    expect(restored.ciphertext).not.toContain('r1');

    // Unwrap and verify content integrity
    const { manifest: m2, payload: p2 } = unwrapFromArchive(restored, key);
    expect(m2).toEqual(manifest);
    const decoded = JSON.parse(gunzipSync(Buffer.from(p2)).toString('utf8'));
    expect(decoded.tables[0].records).toHaveLength(3);
    expect(decoded.tables[1].records[0].fields.name).toBe('alice');
  });

  it('InMemoryBackupStore roundtrips the same envelope shape', async () => {
    const store = new InMemoryBackupStore();
    const envelope = wrapForArchive({ manifest: mkManifest(), payload: mkPayload() }, key);
    const fp = await store.write('snap_002', Buffer.from(JSON.stringify(envelope)));
    const raw = await store.read(fp);
    const restored = JSON.parse(Buffer.from(raw).toString('utf8')) as IBackupEnvelope;
    const { payload } = unwrapFromArchive(restored, key);
    expect(payload.byteLength).toBeGreaterThan(0);
  });

  it('detects tampering: bit-flip in ciphertext fails unwrap', async () => {
    const store = new FsBackupStore(tempDir);
    const envelope = wrapForArchive({ manifest: mkManifest(), payload: mkPayload() }, key);
    const fp = await store.write('snap_003', Buffer.from(JSON.stringify(envelope)));
    const raw = await fs.readFile(fp, 'utf8');
    const parsed = JSON.parse(raw) as IBackupEnvelope;

    // Flip a base64 char in the ciphertext
    const tampered: IBackupEnvelope = {
      ...parsed,
      ciphertext: parsed.ciphertext.slice(0, -4) + 'AAAA',
    };
    // Recompute checksum to defeat checksum layer, leaving auth tag check
    const { sha256Checksum } = await import('./backup-integrity');
    const ctBytes = Buffer.from(tampered.ciphertext, 'base64');
    tampered.checksum = sha256Checksum(ctBytes);

    const err = (() => {
      try {
        unwrapFromArchive(tampered, key);
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_AUTH_TAG_MISMATCH');
  });

  it('detects corruption: checksum mismatch throws BACKUP_CHECKSUM_MISMATCH', async () => {
    const store = new FsBackupStore(tempDir);
    const envelope = wrapForArchive({ manifest: mkManifest(), payload: mkPayload() }, key);
    const fp = await store.write('snap_004', Buffer.from(JSON.stringify(envelope)));
    const raw = await fs.readFile(fp, 'utf8');
    const parsed = JSON.parse(raw) as IBackupEnvelope;

    // Replace checksum with a wrong value (do NOT modify ciphertext -> checksum will mismatch)
    const corrupted: IBackupEnvelope = { ...parsed, checksum: 'sha256:00' };
    const err = (() => {
      try {
        unwrapFromArchive(corrupted, key);
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_CHECKSUM_MISMATCH');
  });

  it('rejects wrong key with BACKUP_AUTH_TAG_MISMATCH', async () => {
    const store = new FsBackupStore(tempDir);
    const envelope = wrapForArchive({ manifest: mkManifest(), payload: mkPayload() }, key);
    const fp = await store.write('snap_005', Buffer.from(JSON.stringify(envelope)));
    const raw = await fs.readFile(fp, 'utf8');
    const restored = JSON.parse(raw) as IBackupEnvelope;

    const wrongKey = deriveBackupKey('attacker-key');
    const err = (() => {
      try {
        unwrapFromArchive(restored, wrongKey);
      } catch (e) {
        return e as Error & { code: string };
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.code).toBe('BACKUP_AUTH_TAG_MISMATCH');
  });

  it('blocks cross-tenant restore (BACKUP_CROSS_TENANT_BLOCKED)', () => {
    expect(() =>
      assertRestoreTargetAllowed({ snapshotBaseId: 'base1', targetBaseId: 'base2' })
    ).toThrow(/cross-tenant restore blocked/);
  });

  it('allows cross-tenant restore when explicitly opted in (clone workflow)', () => {
    const r = assertRestoreTargetAllowed({
      snapshotBaseId: 'base1',
      targetBaseId: 'base2',
      allowCrossTenant: true,
    });
    expect(r.targetBaseId).toBe('base2');
  });

  it('FsBackupStore.remove() actually deletes the file', async () => {
    const store = new FsBackupStore(tempDir);
    const fp = await store.write('snap_006', Buffer.from('payload'));
    expect(await fs.stat(fp)).toBeTruthy();
    await store.remove(fp);
    await expect(fs.stat(fp)).rejects.toThrow();
  });

  it('BackupService.createBackup / listSnapshots / deleteSnapshot integrate with FsBackupStore', async () => {
    const store = new FsBackupStore(tempDir);

    // Stub Prisma snapshot delegate (we don't have a real DB)
    const rows: Record<string, Record<string, unknown>> = {};
    const snapshotDelegate = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: data['id'] as string };
        rows[row.id] = row;
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const id = (where['id'] as string) ?? '';
        return rows[id] ?? null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const baseId = (where['baseId'] as string) ?? '';
        return Object.values(rows).filter((r) => r['baseId'] === baseId);
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        rows[where.id] = { ...rows[where.id], ...data };
        return rows[where.id];
      },
      delete: async ({ where }: { where: { id: string } }) => {
        delete rows[where.id];
        return { id: where.id };
      },
    };
    const restoreDelegate = {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: data['id'] }),
      findMany: async () => [],
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ ...where, ...data }),
    };
    const prisma = {
      backupSnapshot: snapshotDelegate,
      backupRestoreLog: restoreDelegate,
    } as never;

    const marshaller = async (baseId: string) => ({
      baseId,
      tables: [{ id: 't1', name: 'T1', recordCount: 1 }],
      totalRecords: 1,
      payloadBytes: 100,
    });
    const rowApplier = async () => 1;

    const svc = new BackupService(prisma, { store, marshaller: marshaller as never, rowApplier: rowApplier as never, archiveDir: tempDir });

    const snapshot = await svc.createBackup({ baseId: 'base1', createdBy: 'admin' });
    expect(snapshot.status).toBe('complete');
    expect(snapshot.sizeBytes).toBeGreaterThan(0);
    expect(snapshot.archivePath).toContain(tempDir);

    const list = await svc.listSnapshots('base1');
    expect(list.find((s) => s.id === snapshot.id)).toBeTruthy();

    const got = await svc.getSnapshot(snapshot.id);
    expect(got?.id).toBe(snapshot.id);

    const removed = await svc.deleteSnapshot(snapshot.id);
    expect(removed).toBe(true);
    // File removed
    await expect(fs.stat(snapshot.archivePath)).rejects.toThrow();
  });
});
