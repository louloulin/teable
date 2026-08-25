/**
 * Backup / restore (Stage 20) — types.
 *
 * Backups are base-scoped: a snapshot captures every table + every
 * record in one base. Restores target a (possibly different) base and
 * either merge or replace (the caller picks).
 */

export type MergeMode = 'merge' | 'replace';

export interface IBackupManifest {
  baseId: string;
  tables: Array<{
    id: string;
    name: string;
    recordCount: number;
  }>;
  totalRecords: number;
  /** Total bytes of the unserialized payload (pre-compression). */
  payloadBytes: number;
}

export interface ICreateBackupInput {
  baseId: string;
  createdBy: string;
  /** Override the on-disk directory for the archive file. */
  archiveDir?: string;
}

export interface IRestoreInput {
  snapshotId: string;
  targetBaseId: string;
  mode: MergeMode;
  /** Optional override; defaults to the snapshot's stored path. */
  archivePath?: string;
}

export interface ISnapshotRow {
  id: string;
  baseId: string;
  createdBy: string;
  status: 'pending' | 'complete' | 'failed';
  sizeBytes: number;
  archivePath: string;
  manifest: IBackupManifest | null;
  errorMessage: string | null;
  createdTime: Date;
  lastModifiedTime: Date;
}

export interface IRestoreLogRow {
  id: string;
  snapshotId: string;
  targetBaseId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  startedTime: Date | null;
  finishedTime: Date | null;
  rowsRestored: number;
  errorMessage: string | null;
}

/**
 * Storage abstraction. The default implementation writes JSON to a
 * local directory; tests can swap in an in-memory store to keep the
 * filesystem out of the unit-test process.
 */
export interface IBackupStore {
  write(snapshotId: string, payload: Uint8Array): Promise<string>;
  read(archivePath: string): Promise<Uint8Array>;
  remove(archivePath: string): Promise<void>;
}
