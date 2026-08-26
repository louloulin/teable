/**
 * Dashboard — thin-DI wrapper helpers (Stage 130).
 *
 * Pure formatting / geometry helpers consumed by the dashboard auth
 * service. No Nest DI surface.
 */

import type { IWidgetBounds, IWidgetTypeDef } from './dashboard.types';

/** Stable label for a widget kind (used in catalog pickers). */
export function formatWidgetType(kind: IWidgetTypeDef['kind']): string {
  if (kind === 'embed') return 'Embedded view';
  if (kind === 'plugin') return 'Plugin widget';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Compute lower-right corner for a widget's 12-col layout. */
export function computeWidgetBounds(b: {
  x: number;
  y: number;
  w: number;
  h: number;
}): IWidgetBounds {
  return { x: b.x, y: b.y, w: b.w, h: b.h, right: b.x + b.w, bottom: b.y + b.h };
}