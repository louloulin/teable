/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Per-base storage metering — Stage 81.
 *
 * Computes base-level storage attribution per org/base on a daily
 * granularity. Cooperates with Stage 69 (org-level billing roll-up)
 * and Stage 65 (quota orchestration).
 */

export type StorageKind = 'records' | 'attachments' | 'snapshots' | 'history' | 'other';

export interface IStorageSample {
  id: string;
  orgId: string;
  baseId: string;
  kind: StorageKind;
  /** Bytes at sample time. */
  bytes: number;
  /** ISO timestamp at sample end. */
  endedAt: string;
}

export interface IStorageAttribution {
  baseId: string;
  orgId: string;
  totalBytes: number;
  byKind: Record<StorageKind, number>;
}

export interface IStorageBillableLine {
  baseId: string;
  orgId: string;
  bytes: number;
  /** Cents billed for this base. */
  cents: number;
}

export const STORAGE_CENTS_PER_GB = 4;
export const STORAGE_BYTES_PER_GB = 1_073_741_824;
export const STORAGE_KINDS: ReadonlyArray<StorageKind> = [
  'records',
  'attachments',
  'snapshots',
  'history',
  'other',
];
export const STORAGE_MAX_KINDS_PER_BASE = STORAGE_KINDS.length;
export const STORAGE_MAX_SAMPLES_PER_BASE = 256;
