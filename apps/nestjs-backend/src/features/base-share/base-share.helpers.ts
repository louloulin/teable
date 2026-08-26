/**
 * Base-share — thin-DI wrapper (Stage N).
 *
 * Pure helpers for normalising share permissions. Consumed by
 * `BaseShareAuthService` for trivial validation work.
 */

import type { IBaseShareInfo } from './base-share-auth.service';
import type { ISharePasswordCheck, ISharePermissionSummary } from './base-share-auth.types';

/** Format a share record into a permission summary. */
export function formatShareTokenPermission(share: IBaseShareInfo): ISharePermissionSummary {
  return {
    shareId: share.shareId,
    baseId: share.baseId,
    allowView: true, // base-share always permits view once enabled
    allowEdit: share.allowEdit ?? false,
    allowSave: share.allowSave ?? false,
    allowCopy: share.allowCopy ?? false,
    hasPassword: false,
  };
}

/** Check whether a candidate password matches the stored one. */
export function checkSharePassword(stored: string | null, candidate: string | null): ISharePasswordCheck {
  if (!stored) return { matches: false, reason: 'no-password' };
  if (!candidate) return { matches: false, reason: 'wrong-password' };
  return candidate === stored ? { matches: true, reason: 'ok' } : { matches: false, reason: 'wrong-password' };
}
