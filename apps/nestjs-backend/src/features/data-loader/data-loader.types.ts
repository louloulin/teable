/**
 * Data-loader — thin-DI wrapper types (Stage 130).
 *
 * Minimal shape for the data-loader auth surface. The production
 * services keep their own richer types — these are just the load-key
 * vocabulary the auth façade exposes.
 */

export type LoadKeyKind = 'field' | 'table' | 'view';

export interface ILoadKey {
  kind: LoadKeyKind;
  /** Composite key — kind + id encoded. */
  composite: string;
  id: string;
}

export interface IInspectResult {
  requested: number;
  /** Keys after dedupe, in original encounter order. */
  unique: ILoadKey[];
  /** Keys that the loader actually has registered. */
  known: ILoadKey[];
  /** Keys the loader has not registered yet. */
  missing: ILoadKey[];
}