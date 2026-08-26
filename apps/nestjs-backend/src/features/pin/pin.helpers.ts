/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Pin — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the pin auth surface. No Nest DI, no Prisma — safe to
 * call from anywhere. Consumed by `PinAuthService` (auth-only surface).
 */

import type { IPinRecord } from './pin.types';

/** Normalize the recordId to a stable string (defensive trim). */
export function normalizePinRecordId(recordId: string): string {
  return recordId.trim();
}

/** True when `lastUsedTime` is older than `maxAgeMs` milliseconds ago. */
export function isPinStale(record: Pick<IPinRecord, 'lastUsedTime'>, maxAgeMs: number, now: Date = new Date()): boolean {
  if (!record.lastUsedTime) return false;
  const ageMs = now.getTime() - new Date(record.lastUsedTime).getTime();
  return ageMs > maxAgeMs;
}