/**
 * Base-share — thin-DI wrapper (Stage N).
 *
 * Minimal types for the share auth surface. The full JWT issuance flow
 * (authToken / validateJwtToken) and the share record CRUD remain in
 * `base-share-auth.service.ts` and `base-share.service.ts`; this surface
 * declares the share-permission shape used by the validation helpers.
 */

export type SharePermission = 'view' | 'edit' | 'save' | 'copy';

export interface ISharePermissionSummary {
  shareId: string;
  baseId: string;
  allowView: boolean;
  allowEdit: boolean;
  allowSave: boolean;
  allowCopy: boolean;
  hasPassword: boolean;
}

export interface ISharePasswordCheck {
  matches: boolean;
  reason: 'no-password' | 'wrong-password' | 'ok';
}
