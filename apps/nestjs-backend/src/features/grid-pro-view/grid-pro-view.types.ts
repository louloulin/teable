/**
 * Grid Pro View — types (Stage 116).
 *
 * Compose the metadata schema + layout + conditional format + config panel
 * into a single grid-pro view descriptor used by the frontend.
 */

import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import { ViewportSpec } from '../view-layout-engine/view-layout-engine.types';
import { FormatRule } from '../view-conditional-format-engine/view-conditional-format-engine.types';

export interface GridProCellData {
  fieldId: string;
  rowId: string;
  value: unknown;
}

export interface GridProCellRender {
  rowId: string;
  fieldId: string;
  text: string;
  style: {
    width: number;
    height: number;
    background?: string;
    color?: string;
    icon?: string;
    barIntensity?: number;
  };
}

export interface GridProViewSpec {
  viewId: string;
  viewport: ViewportSpec;
  meta: ViewMetadataSpec;
  rows: string[];
  condFormatRules: FormatRule[];
}

export interface GridProRenderResult {
  viewId: string;
  cells: GridProCellRender[];
  totalRows: number;
  totalWidth: number;
  totalHeight: number;
}

export const GRID_PRO_DEFAULT_ROW_HEIGHT = 32;
export const GRID_PRO_DEFAULT_HEADER_HEIGHT = 32;
export const GRID_PRO_MAX_ROWS = 5000;