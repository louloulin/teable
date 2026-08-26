/**
 * Dashboard — thin-DI wrapper types (Stage 130).
 *
 * Shape for the lightweight widget-type catalog the dashboard auth
 * surface exposes. Domain adapters map to richer internal types.
 */

export type WidgetKind = 'chart' | 'table' | 'metric' | 'embed' | 'plugin';

export interface IWidgetTypeDef {
  kind: WidgetKind;
  /** Human label shown in the catalog picker. */
  label: string;
  /** Default 12-col grid bounds for new layouts. */
  defaultBounds: { x: number; y: number; w: number; h: number };
}

export interface IWidgetBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Inclusive lower-right corner (x + w, y + h). */
  right: number;
  bottom: number;
}