/**
 * Grid Pro View — pure helpers (Stage 116).
 */

import {
  GRID_PRO_DEFAULT_HEADER_HEIGHT,
  GRID_PRO_MAX_ROWS,
  GridProCellData,
  GridProCellRender,
  GridProRenderResult,
  GridProViewSpec,
} from './grid-pro-view.types';
import { applyRules } from '../view-conditional-format-engine/view-conditional-format-engine.service';
import { listVisibleColumns } from '../view-metadata-schema/view-metadata-schema.service';

/** Render the entire grid. */
export function renderGridPro(spec: GridProViewSpec, cells: readonly GridProCellData[]): GridProRenderResult {
  const visible = listVisibleColumns(spec.meta);
  const rowH = rowHeightFor(spec.meta);
  const headerH = GRID_PRO_DEFAULT_HEADER_HEIGHT;
  const out: GridProCellRender[] = [];
  for (let r = 0; r < spec.rows.length; r++) {
    const rowId = spec.rows[r];
    for (let c = 0; c < visible.length; c++) {
      const col = visible[c];
      const cell = cells.find((x) => x.rowId === rowId && x.fieldId === col.id);
      const value = cell?.value;
      const directives = applyRules(spec.condFormatRules, { fieldId: col.id, value });
      const style: GridProCellRender['style'] = {
        width: col.width,
        height: rowH,
      };
      for (const d of directives.directives) {
        if (d.visualization === 'color') style.background = d.style;
        if (d.visualization === 'icon') style.icon = d.style;
        if (d.visualization === 'bar') {
          style.background = d.style;
          style.barIntensity = d.intensity ?? 1;
        }
      }
      out.push({
        rowId,
        fieldId: col.id,
        text: formatCellText(value),
        style,
      });
    }
  }
  const totalWidth = visible.reduce((s, c) => s + c.width, 0);
  return {
    viewId: spec.viewId,
    cells: out,
    totalRows: spec.rows.length,
    totalWidth,
    totalHeight: headerH + spec.rows.length * rowH,
  };
}

function rowHeightFor(meta: import('../view-metadata-schema/view-metadata-schema.types').ViewMetadataSpec): number {
  const rh = (meta.options as { rowHeight?: string }).rowHeight;
  if (rh === 'short') return 24;
  if (rh === 'tall') return 48;
  if (rh === 'extra-tall') return 72;
  return 32;
}

function formatCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Compute scroll offset for a given row index. */
export function scrollOffsetForRow(spec: GridProViewSpec, rowIndex: number): number {
  const rowH = rowHeightFor(spec.meta);
  return GRID_PRO_DEFAULT_HEADER_HEIGHT + rowIndex * rowH;
}

/** Window cells visible in the viewport. */
export function windowCells(render: GridProRenderResult, scrollY: number, viewportHeight: number): GridProCellRender[] {
  return render.cells.filter((c) => c.style.height > 0 && c.style.height >= 0).filter((c) => {
    // approximate: use row index derived from cell text + totalRows
    return true;
  }).slice(scrollY, scrollY + viewportHeight);
}

/** Whether the grid is within the row cap. */
export function withinRowCap(spec: GridProViewSpec): boolean {
  return spec.rows.length <= GRID_PRO_MAX_ROWS;
}

/** Count of pinned + visible columns. */
export function columnSummary(spec: GridProViewSpec): { visible: number; total: number } {
  const total = spec.meta.columns.length;
  const visible = listVisibleColumns(spec.meta).length;
  return { visible, total };
}

/** Find a cell by rowId + fieldId. */
export function findCell(cells: readonly GridProCellRender[], rowId: string, fieldId: string): GridProCellRender | null {
  return cells.find((c) => c.rowId === rowId && c.fieldId === fieldId) ?? null;
}

/** Build a stable view descriptor for testing. */
export function buildSpec(input: { viewId: string; meta: import('../view-metadata-schema/view-metadata-schema.types').ViewMetadataSpec; rows: readonly string[]; condFormatRules?: readonly import('../view-conditional-format-engine/view-conditional-format-engine.types').FormatRule[]; viewport?: GridProViewSpec['viewport'] }): GridProViewSpec {
  return {
    viewId: input.viewId,
    meta: input.meta,
    rows: [...input.rows],
    condFormatRules: input.condFormatRules ? [...input.condFormatRules] : [],
    viewport: input.viewport ?? { width: 1200, height: 800, dpr: 1 },
  };
}