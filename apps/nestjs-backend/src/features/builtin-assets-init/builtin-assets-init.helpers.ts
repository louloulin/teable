/**
 * Builtin-assets-init — thin-DI wrapper (Stage N).
 *
 * Pure helpers for normalising asset ids (the `attachments.token` column
 * is the source of truth). Consumed by `BuiltinAssetsInitAuthService`.
 */

/** Strip whitespace + lowercase an asset id. */
export function formatAssetId(rawId: string): string {
  return rawId.trim().toLowerCase();
}

/** True when `observed >= expected` — i.e. initialisation is complete. */
export function isAssetInitComplete(observed: number, expected: number): boolean {
  if (expected <= 0) return true;
  return observed >= expected;
}
