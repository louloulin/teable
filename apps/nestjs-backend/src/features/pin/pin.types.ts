/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Pin — thin-DI wrapper (Stage N).
 *
 * Minimal types for the pin auth surface. The full pin lifecycle
 * (create / verify / disable) stays in `pin.service.ts`; this module
 * only declares the shapes needed by `PinAuthService`.
 */

export interface IPinRecord {
  id: string;
  tableId: string;
  recordId: string;
  userId: string;
  /** Time of last activity for staleness checks. */
  lastUsedTime: Date | null;
}

export interface IValidatedPin {
  tableId: string;
  recordId: string;
  userId: string;
  lastUsedTime: string | null;
}