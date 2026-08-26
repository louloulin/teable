/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Invitation — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the invitation auth surface. No Nest DI, no Prisma —
 * safe to call from anywhere. Consumed by `InvitationAuthService`.
 */

import type { IInvitationRecord } from './invitation.types';

/** Normalize an email for lookup (lowercase + trim). */
export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when `expiredTime` is in the past (1ms tolerance). */
export function isInvitationExpired(record: Pick<IInvitationRecord, 'expiredTime'>): boolean {
  if (!record.expiredTime) return false;
  return new Date(record.expiredTime).getTime() < Date.now() + 1000;
}