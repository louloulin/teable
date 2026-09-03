/**
 * R-View-Pivot — Backend aggregation service (Cloud Business §视图 §透视表).
 *
 * Reads records from a table and runs the pure `computePivot` function from
 * `@teable/core`. This is intentionally a thin wrapper — the heavy logic
 * lives in @teable/core so it can be reused on the frontend.
 */

import { Injectable } from '@nestjs/common';
import {
  computePivot,
  type IPivotInput,
  type IPivotResult,
  type MeasureFunction,
} from '@teable/core';
import { ViewType } from '@teable/core';

export interface IPivotAggregateInput extends IPivotInput {
  tableId: string;
}

export interface IPivotSerializableResult {
  rows: ReadonlyArray<{ value: unknown; count: number }>;
  columns: ReadonlyArray<{ value: unknown; count: number }>;
  /** Plain object — JSON-safe representation of the cell map. */
  cells: Record<string, { value: number | null; count: number }>;
  totalRecords: number;
}

@Injectable()
export class PivotAggregationService {
  /**
   * Static helper that lets callers pass in records directly. This is the
   * pure entry point and is unit-testable.
   */
  aggregateRecords<T extends Record<string, unknown>>(
    records: ReadonlyArray<T>,
    options: IPivotInput
  ): IPivotSerializableResult {
    const result: IPivotResult = computePivot(records, options);
    // Map → plain object so JSON.stringify preserves the cells.
    const cells: Record<string, { value: number | null; count: number }> = {};
    for (const [key, value] of result.cells.entries()) {
      cells[key] = { value: value.value, count: value.count };
    }
    return {
      rows: result.rows,
      columns: result.columns,
      cells,
      totalRecords: result.totalRecords,
    };
  }

  /**
   * Resolve the pivot input from a view's options. Returns null if the
   * view is not a pivot view or required fields are missing.
   */
  static fromView(view: {
    type?: ViewType;
    options?: Record<string, unknown> | null;
  }): IPivotInput | null {
    if (view.type !== ViewType.Pivot) return null;
    const o = (view.options ?? {}) as Partial<IPivotInput>;
    if (!o.rowFieldId || !o.columnFieldId || !o.measureFieldId || !o.measureFunction) {
      return null;
    }
    return {
      rowFieldId: o.rowFieldId,
      columnFieldId: o.columnFieldId,
      measureFieldId: o.measureFieldId,
      measureFunction: o.measureFunction as MeasureFunction,
      showEmptyGroups: o.showEmptyGroups,
    };
  }
}
