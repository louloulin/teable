/**
 * R-View-Pivot — Pivot aggregation engine (Cloud Business §视图 §透视表).
 *
 * Pure functions that turn a flat record array + pivot options into an
 * aggregated cell matrix. No I/O, no DI — consumable from backend
 * services or frontend blocks alike.
 *
 * Aggregation functions:
 *   sum, avg, count, min, max, median
 *
 * Cell shape:
 *   { rows: RowKey[], columns: ColKey[], cells: Map<`${rowIdx}|${colIdx}`, number> }
 *
 * Where RowKey = { value, count } and ColKey = { value, count }. Empty
 * groups are emitted when `showEmptyGroups: true`.
 */

export type MeasureFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median';

export const MEASURE_FUNCTIONS: readonly MeasureFunction[] = [
  'sum',
  'avg',
  'count',
  'min',
  'max',
  'median',
] as const;

export interface IPivotInput {
  /** Field id used as row dimension. */
  rowFieldId: string;
  /** Field id used as column dimension. */
  columnFieldId: string;
  /** Field id whose numeric / scalar values are aggregated. */
  measureFieldId: string;
  measureFunction: MeasureFunction;
  /** Whether empty row/column groups are emitted. Defaults to false. */
  showEmptyGroups?: boolean;
}

export interface IPivotCellValue {
  value: number | null;
  /** Number of records that contributed to this cell. */
  count: number;
}

export type IPivotCellKey = `${number}|${number}`;

export interface IPivotResult {
  rows: ReadonlyArray<{ value: unknown; count: number }>;
  columns: ReadonlyArray<{ value: unknown; count: number }>;
  cells: ReadonlyMap<IPivotCellKey, IPivotCellValue>;
  /** Total number of input records considered. */
  totalRecords: number;
}

/**
 * Coerce a record cell value to a finite number. Non-numeric strings,
 * booleans, null, and undefined return `null` — they are excluded from
 * numeric aggregations but still counted by `count`.
 */
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
};

/**
 * Median helper — handles both empty and odd/even length collections.
 */
const median = (values: ReadonlyArray<number>): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const aggregate = (
  values: ReadonlyArray<number | null>,
  fn: MeasureFunction
): number | null => {
  const numeric = values.filter((v): v is number => v !== null);
  switch (fn) {
    case 'count':
      // count counts records, not numeric values
      return values.length;
    case 'sum':
      return numeric.length === 0 ? null : numeric.reduce((a, b) => a + b, 0);
    case 'avg':
      return numeric.length === 0 ? null : numeric.reduce((a, b) => a + b, 0) / numeric.length;
    case 'min':
      return numeric.length === 0 ? null : Math.min(...numeric);
    case 'max':
      return numeric.length === 0 ? null : Math.max(...numeric);
    case 'median':
      return median(numeric);
  }
};

/**
 * Build a unique key from a pivot dimension value. We serialize unknown
 * values deterministically so equal values (e.g. same number, same date
 * ISO string) collapse into the same group.
 */
const dimensionKey = (value: unknown): string => {
  if (value === null || value === undefined) return '__null__';
  if (value instanceof Date) return `d:${value.getTime()}`;
  if (typeof value === 'object') return `j:${JSON.stringify(value)}`;
  return `${typeof value}:${String(value)}`;
};

/**
 * Run pivot aggregation on a flat record list.
 *
 * `records` is expected to be `Record<string, unknown>[]`; each record
 * must contain the rowFieldId / columnFieldId / measureFieldId keys.
 *
 * Returns an IPivotResult describing the row/column groups and the
 * aggregated cell values. Empty groups are filtered unless
 * `showEmptyGroups: true` is passed.
 */
export const computePivot = <T extends Record<string, unknown>>(
  records: ReadonlyArray<T>,
  options: IPivotInput
): IPivotResult => {
  const showEmpty = options.showEmptyGroups ?? false;

  // Phase 1: bucket records by row/column dimensions
  const rowBuckets = new Map<string, { value: unknown; recordIds: T[] }>();
  const colBuckets = new Map<string, { value: unknown; recordIds: T[] }>();

  for (const record of records) {
    const rk = dimensionKey(record[options.rowFieldId]);
    const ck = dimensionKey(record[options.columnFieldId]);
    if (!rowBuckets.has(rk)) {
      rowBuckets.set(rk, { value: record[options.rowFieldId], recordIds: [] });
    }
    if (!colBuckets.has(ck)) {
      colBuckets.set(ck, { value: record[options.columnFieldId], recordIds: [] });
    }
    rowBuckets.get(rk)!.recordIds.push(record);
    colBuckets.get(ck)!.recordIds.push(record);
  }

  // Phase 2: produce stable ordered row/column groups
  const rowEntries = [...rowBuckets.entries()].map(([k, v]) => ({
    key: k,
    value: v.value,
    count: v.recordIds.length,
  }));
  const colEntries = [...colBuckets.entries()].map(([k, v]) => ({
    key: k,
    value: v.value,
    count: v.recordIds.length,
  }));

  // Phase 3: bucket by both dimensions for cell aggregation
  type CellAcc = { measureValues: (number | null)[] };
  const cellMap = new Map<string, CellAcc & { rowKey: string; colKey: string }>();

  for (const record of records) {
    const rk = dimensionKey(record[options.rowFieldId]);
    const ck = dimensionKey(record[options.columnFieldId]);
    const composite = `${rk}||${ck}`;
    if (!cellMap.has(composite)) {
      cellMap.set(composite, { measureValues: [], rowKey: rk, colKey: ck });
    }
    cellMap.get(composite)!.measureValues.push(toNumber(record[options.measureFieldId]));
  }

  // Phase 4: aggregate cells
  const cells = new Map<IPivotCellKey, IPivotCellValue>();
  // Build row → index map
  const rowIndex = new Map(rowEntries.map((e, i) => [e.key, i] as const));
  const colIndex = new Map(colEntries.map((e, i) => [e.key, i] as const));

  for (const acc of cellMap.values()) {
    const ri = rowIndex.get(acc.rowKey);
    const ci = colIndex.get(acc.colKey);
    if (ri === undefined || ci === undefined) continue;
    const aggregated = aggregate(acc.measureValues, options.measureFunction);
    cells.set(`${ri}|${ci}` as IPivotCellKey, {
      value: aggregated,
      count: acc.measureValues.length,
    });
  }

  // Phase 5: filter empty groups unless requested
  let finalRows = rowEntries;
  let finalCols = colEntries;
  if (!showEmpty) {
    finalRows = rowEntries.filter((r) =>
      colEntries.some((c) => cells.has(`${rowIndex.get(r.key)}|${colIndex.get(c.key)}` as IPivotCellKey))
    );
    finalCols = colEntries.filter((c) =>
      rowEntries.some((r) => cells.has(`${rowIndex.get(r.key)}|${colIndex.get(c.key)}` as IPivotCellKey))
    );
  }

  // Re-index after potential filtering
  const finalRowIdx = new Map(finalRows.map((e, i) => [e.key, i] as const));
  const finalColIdx = new Map(finalCols.map((e, i) => [e.key, i] as const));
  const finalCells = new Map<IPivotCellKey, IPivotCellValue>();
  for (const [cellKey, cell] of cells) {
    const [riStr, ciStr] = cellKey.split('|');
    const ri = finalRowIdx.get(rowEntries[Number(riStr)]?.key ?? '');
    const ci = finalColIdx.get(colEntries[Number(ciStr)]?.key ?? '');
    if (ri === undefined || ci === undefined) continue;
    finalCells.set(`${ri}|${ci}` as IPivotCellKey, cell);
  }

  return {
    rows: finalRows.map(({ value, count }) => ({ value, count })),
    columns: finalCols.map(({ value, count }) => ({ value, count })),
    cells: finalCells,
    totalRecords: records.length,
  };
};
