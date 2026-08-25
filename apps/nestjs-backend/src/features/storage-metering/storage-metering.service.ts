/**
 * Per-base storage metering — pure helpers (Stage 81).
 */

import type {
  IStorageAttribution,
  IStorageBillableLine,
  IStorageSample,
  StorageKind,
} from './storage-metering.types';
import {
  STORAGE_BYTES_PER_GB,
  STORAGE_CENTS_PER_GB,
  STORAGE_KINDS,
} from './storage-metering.types';

/** Whether the kind is canonical. */
export function isStorageKind(s: string): s is StorageKind {
  return (STORAGE_KINDS as ReadonlyArray<string>).includes(s);
}

/** Validate a sample. */
export function validateSample(s: IStorageSample): string | null {
  if (!s.id) return 'id required';
  if (!s.orgId) return 'orgId required';
  if (!s.baseId) return 'baseId required';
  if (!isStorageKind(s.kind)) return `unknown kind: ${s.kind}`;
  if (!Number.isFinite(s.bytes) || s.bytes < 0) return 'bytes must be >= 0';
  if (!s.endedAt) return 'endedAt required';
  return null;
}

/** Initialize a kind bucket. */
export function emptyByKind(): Record<StorageKind, number> {
  const out = {} as Record<StorageKind, number>;
  for (const k of STORAGE_KINDS) out[k] = 0;
  return out;
}

/** Attribute bytes per kind from a list of samples. */
export function attributeSamples(input: {
  orgId: string;
  baseId: string;
  samples: IStorageSample[];
}): IStorageAttribution {
  const byKind = emptyByKind();
  let total = 0;
  for (const s of input.samples) {
    byKind[s.kind] += s.bytes;
    total += s.bytes;
  }
  return { baseId: input.baseId, orgId: input.orgId, totalBytes: total, byKind };
}

/** Cap attribution to the canonical kinds. */
export function normalizeAttribution(a: IStorageAttribution): IStorageAttribution {
  const byKind = emptyByKind();
  for (const k of STORAGE_KINDS) byKind[k] = a.byKind[k] ?? 0;
  return { baseId: a.baseId, orgId: a.orgId, totalBytes: a.totalBytes, byKind };
}

/** Convert bytes to GB (float). */
export function bytesToGb(bytes: number): number {
  return bytes / STORAGE_BYTES_PER_GB;
}

/** Compute cents for an attribution. */
export function billableCents(input: { bytes: number }): number {
  return Math.ceil(bytesToGb(input.bytes) * STORAGE_CENTS_PER_GB);
}

/** Build a billable line from an attribution. */
export function billableLine(a: IStorageAttribution): IStorageBillableLine {
  return {
    baseId: a.baseId,
    orgId: a.orgId,
    bytes: a.totalBytes,
    cents: billableCents({ bytes: a.totalBytes }),
  };
}

/** Sum billable lines for invoice composition. */
export function sumBillable(lines: IStorageBillableLine[]): { cents: number; bytes: number } {
  let cents = 0;
  let bytes = 0;
  for (const l of lines) {
    cents += l.cents;
    bytes += l.bytes;
  }
  return { cents, bytes };
}

/** Append a sample, capped to STORAGE_MAX_SAMPLES_PER_BASE. */
export function appendSample(input: {
  samples: IStorageSample[];
  sample: IStorageSample;
  cap?: number;
}): IStorageSample[] {
  const cap = input.cap ?? 256;
  const next = [...input.samples, input.sample];
  while (next.length > cap) next.shift();
  return next;
}

/** Pick the latest sample per kind for an attribution snapshot. */
export function latestPerKind(samples: IStorageSample[]): IStorageSample[] {
  const byKind = new Map<StorageKind, IStorageSample>();
  for (const s of samples) {
    const cur = byKind.get(s.kind);
    if (!cur || s.endedAt > cur.endedAt) byKind.set(s.kind, s);
  }
  return Array.from(byKind.values());
}

/** Build an attribution from the latest per-kind samples. */
export function attributionFromLatest(input: {
  orgId: string;
  baseId: string;
  samples: IStorageSample[];
}): IStorageAttribution {
  return attributeSamples({
    orgId: input.orgId,
    baseId: input.baseId,
    samples: latestPerKind(input.samples),
  });
}
