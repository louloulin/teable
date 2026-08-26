/**
 * Builtin-assets-init — thin-DI wrapper (Stage N).
 *
 * Minimal types for the asset-init auth surface. The full upload + Redis
 * lock flow remains in `builtin-assets-init.service.ts`; this module only
 * declares the read-only "has it been initialised yet?" shape.
 */

export interface IBuiltinAssetInitStatus {
  /** True once every builtin asset has been uploaded to storage. */
  initialized: boolean;
  /** Number of assets detected in storage. */
  observedCount: number;
  /** Total assets the bootstrap expects to seed (from the service config). */
  expectedCount: number;
}
