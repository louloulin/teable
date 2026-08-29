/**
 * Google Sheets bidirectional sync — T-15 Wave 10.
 *
 * Pure helpers used by the GoogleSheetsController and its specs:
 *   - column type detection for importSheetToTable
 *   - row-typed parsing of the Sheets `valueRanges` payload
 *   - batchUpdate request construction for exportTableToSheet
 *   - reconcile diff between last-known snapshot and current sheet
 *
 * The HTTP code that actually fetches the sheet and writes records
 * lives in `google-sheets-sync-runner.ts` (in this same directory);
 * keeping the helpers here means the spec can exercise the type
 * mapping without touching the network layer.
 */

import { createHash } from 'node:crypto';

export type GoogleSheetsCellType = 'string' | 'number' | 'bool' | 'date' | 'empty';

export type TeableColumnType =
  | 'singleLineText'
  | 'longText'
  | 'number'
  | 'checkbox'
  | 'date';

/** Sheets API `cellFormat.userEnteredFormat` subset we care about. */
export interface IGoogleSheetsEffectiveFormat {
  numberFormat?: { type?: string; pattern?: string } | null;
  backgroundColor?: { red?: number; green?: number; blue?: number } | null;
  textFormat?: { bold?: boolean } | null;
}

export interface IGoogleSheetsCell {
  /** User-entered string. */
  userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean } | null;
  /** Optional formatting (when `includeGridData=true`). */
  userEnteredFormat?: IGoogleSheetsEffectiveFormat | null;
  formattedValue?: string;
}

export interface IGoogleSheetsRow {
  values?: IGoogleSheetsCell[];
}

export interface IGoogleSheetsSheet {
  properties: { sheetId: number; title: string; index: number };
  data?: Array<{
    startRow?: number;
    startColumn?: number;
    rowData?: IGoogleSheetsRow[];
  }>;
}

export interface IGoogleSheetsSpreadsheet {
  spreadsheetId: string;
  properties?: { title?: string };
  sheets: IGoogleSheetsSheet[];
}

export interface ITeableFieldPlan {
  /** Stable client-side id (used as the `id` in IFieldRo). */
  id: string;
  /** Field name (header). */
  name: string;
  type: TeableColumnType;
  /** Heuristic description: "type inferred from N numbers / M strings" */
  inference: string;
}

export interface IImportPlan {
  tableName: string;
  sheetId: number;
  fields: ITeableFieldPlan[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface IExportPlan {
  sheetId: number;
  /** The full 2D array of values to write (header + data rows). */
  values: string[][];
  /** Where in the grid the data starts (A1 by default). */
  range: string;
}

export interface IReconcileDiff {
  inserts: Array<{ key: string; payload: Record<string, unknown> }>;
  updates: Array<{ key: string; from: Record<string, unknown>; to: Record<string, unknown> }>;
  deletes: Array<{ key: string }>;
  unchanged: number;
}

const HEADER_SAMPLE_LIMIT = 32;
const ROW_SAMPLE_LIMIT = 200;

const inferCellType = (cell: IGoogleSheetsCell | undefined): GoogleSheetsCellType => {
  if (!cell) return 'empty';
  const v = cell.userEnteredValue;
  if (!v) return cell.formattedValue ? 'string' : 'empty';
  if (typeof v.boolValue === 'boolean') return 'bool';
  if (typeof v.numberValue === 'number' && Number.isFinite(v.numberValue)) {
    const fmt = cell.userEnteredFormat?.numberFormat;
    if (fmt && (fmt.type === 'DATE' || fmt.type === 'DATE_TIME' || fmt.type === 'TIME')) {
      return 'date';
    }
    return 'number';
  }
  if (typeof v.stringValue === 'string' && v.stringValue.length > 0) return 'string';
  return 'empty';
};

const BOOL_TRUE = new Set(['TRUE', 'YES', 'Y', '1', '真', '是']);
const BOOL_FALSE = new Set(['FALSE', 'NO', 'N', '0', '假', '否']);

const parseDateSerial = (n: number): string | null => {
  // Google Sheets serial day 0 = 1899-12-30; treat as UTC midnight.
  if (!Number.isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86_400_000);
  if (ms < -8_640_000_000_000_000 || ms > 8_640_000_000_000_000) return null;
  return new Date(ms).toISOString().slice(0, 10);
};

const parseCellForType = (
  cell: IGoogleSheetsCell | undefined,
  type: TeableColumnType
): string | number | boolean | null => {
  if (!cell) return null;
  const t = inferCellType(cell);
  if (t === 'empty') return null;
  const v = cell.userEnteredValue;
  const raw = cell.formattedValue ?? v?.stringValue ?? '';
  switch (type) {
    case 'singleLineText':
      return typeof v?.stringValue === 'string' ? v.stringValue : raw;
    case 'longText':
      return typeof v?.stringValue === 'string' ? v.stringValue : raw;
    case 'number': {
      if (typeof v?.numberValue === 'number') return v.numberValue;
      const asNumber = Number(raw);
      return Number.isFinite(asNumber) ? asNumber : null;
    }
    case 'checkbox': {
      const s = (raw ?? '').toString().trim().toUpperCase();
      if (BOOL_TRUE.has(s)) return true;
      if (BOOL_FALSE.has(s)) return false;
      if (typeof v?.boolValue === 'boolean') return v.boolValue;
      return null;
    }
    case 'date': {
      if (typeof v?.numberValue === 'number') return parseDateSerial(v.numberValue);
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
    }
  }
};

const colId = (): string =>
  `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Detect a Teable column type from a column of cells. Strategy:
 *   - if any cell carries a `boolValue` true/false → checkbox
 *   - else if every non-empty cell is a number, and the column has
 *     a DATE/TIME format hint, → date
 *   - else if every non-empty cell is a number → number
 *   - else if any cell has a multi-line string → longText
 *   - else → singleLineText
 */
export const inferColumnType = (cells: ReadonlyArray<IGoogleSheetsCell | undefined>): {
  type: TeableColumnType;
  inference: string;
} => {
  let nums = 0;
  let bools = 0;
  let strings = 0;
  let dates = 0;
  let multiline = 0;
  for (const cell of cells) {
    const t = inferCellType(cell);
    if (t === 'empty') continue;
    if (t === 'bool') bools += 1;
    else if (t === 'date') dates += 1;
    else if (t === 'number') nums += 1;
    else if (t === 'string') {
      strings += 1;
      if ((cell?.userEnteredValue?.stringValue ?? '').includes('\n')) multiline += 1;
    }
  }
  if (bools > 0 && nums === 0 && dates === 0) {
    return { type: 'checkbox', inference: `${bools} bool values` };
  }
  if (dates > 0 && nums === dates) {
    return { type: 'date', inference: `${dates} date-serial cells` };
  }
  if (nums > 0 && strings === 0) {
    return { type: 'number', inference: `${nums} numbers` };
  }
  if (multiline > 0) {
    return { type: 'longText', inference: `${multiline} multi-line strings` };
  }
  return { type: 'singleLineText', inference: `${strings} strings` };
};

/**
 * Build an import plan from a Google Sheets `get spreadsheet` payload.
 * The first non-empty row of the chosen sheet is treated as the
 * header; subsequent rows are projected into the typed field plan.
 */
export const planImport = (spreadsheet: IGoogleSheetsSpreadsheet, sheetTitle: string): IImportPlan => {
  const sheet = spreadsheet.sheets.find((s) => s.properties.title === sheetTitle);
  if (!sheet) {
    throw new Error(`sheet not found: ${sheetTitle}`);
  }
  const grid = sheet.data?.[0];
  const rows = grid?.rowData ?? [];
  // Find first non-empty row → header.
  const headerRowIdx = rows.findIndex((r) => (r.values ?? []).some((c) => inferCellType(c) !== 'empty'));
  if (headerRowIdx === -1) {
    return { tableName: sheetTitle, sheetId: sheet.properties.sheetId, fields: [], rows: [] };
  }
  const headerCells = rows[headerRowIdx]?.values ?? [];
  const headers = headerCells.map((c, i) => c.userEnteredValue?.stringValue ?? c.formattedValue ?? `Column ${i + 1}`);

  // Column buckets for type inference.
  const buckets: Array<Array<IGoogleSheetsCell | undefined>> = headers.map(() => []);
  const dataRows: IGoogleSheetsRow[] = [];
  for (let i = headerRowIdx + 1; i < rows.length && dataRows.length < ROW_SAMPLE_LIMIT; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const isEmpty = (row.values ?? []).every((c) => inferCellType(c) === 'empty');
    if (isEmpty) continue;
    dataRows.push(row);
    const cells = row.values ?? [];
    for (let c = 0; c < headers.length; c += 1) {
      const bucket = buckets[c];
      if (bucket) bucket.push(cells[c]);
    }
  }

  const fields: ITeableFieldPlan[] = headers.map((name, idx) => {
    const bucket = buckets[idx] ?? [];
    const sample = bucket.slice(0, HEADER_SAMPLE_LIMIT);
    const { type, inference } = inferColumnType(sample);
    return { id: colId(), name: String(name), type, inference };
  });

  const typedRows = dataRows.map((row) => {
    const out: Record<string, string | number | boolean | null> = {};
    const cells = row.values ?? [];
    fields.forEach((f, idx) => {
      out[f.id] = parseCellForType(cells[idx], f.type);
    });
    return out;
  });

  return {
    tableName: sheetTitle,
    sheetId: sheet.properties.sheetId,
    fields,
    rows: typedRows,
  };
};

/**
 * Build a Sheets `batchUpdate` request that overwrites the
 * `range` on `sheetId` with `values`. Header row + data rows are
 * flattened to a 2D string array (the Sheets API doesn't accept
 * numbers when valueInputOption=USER_ENTERED unless the string
 * looks like a number — easier to coerce defensively).
 */
export const planExport = (input: {
  sheetId: number;
  headers: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  startCell?: string;
}): IExportPlan => {
  const { sheetId, headers, rows } = input;
  const startCell = input.startCell ?? 'A1';
  const headerRow = headers.map((h) => String(h));
  const dataRows = rows.map((r) =>
    headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (Object.prototype.toString.call(v) === '[object Date]') {
        return (v as unknown as Date).toISOString();
      }
      return String(v);
    })
  );
  return {
    sheetId,
    range: startCell,
    values: [headerRow, ...dataRows],
  };
};

/**
 * Convert an export plan into the body of
 * `spreadsheets.values.batchUpdate` (note: this is the values
 * endpoint, distinct from the sheets `batchUpdate` endpoint —
 * the controller dispatches the right one based on the chosen
 * valueInputOption).
 */
export const toValuesBatchUpdate = (
  plan: IExportPlan,
  spreadsheetId: string
): {
  spreadsheetId: string;
  body: {
    valueInputOption: 'USER_ENTERED' | 'RAW';
    data: Array<{ range: string; values: string[][] }>;
  };
} => ({
  spreadsheetId,
  body: {
    valueInputOption: 'USER_ENTERED',
    data: [{ range: `${plan.range}`, values: plan.values }],
  },
});

/**
 * Compute a diff between a previously-snapshotted Teable row set
 * (by `keyField`) and the current sheet rows. The diff is
 * expressed as inserts / updates / deletes.
 */
export const reconcile = (input: {
  snapshot: Record<string, Record<string, unknown>>;
  current: Record<string, Record<string, unknown>>;
  keyField: string;
}): IReconcileDiff => {
  const inserts: IReconcileDiff['inserts'] = [];
  const updates: IReconcileDiff['updates'] = [];
  const deletes: IReconcileDiff['deletes'] = [];
  let unchanged = 0;
  for (const [key, payload] of Object.entries(input.current)) {
    const prev = input.snapshot[key];
    if (!prev) {
      inserts.push({ key, payload });
    } else if (hashRow(payload) !== hashRow(prev)) {
      updates.push({ key, from: prev, to: payload });
    } else {
      unchanged += 1;
    }
  }
  for (const [key] of Object.entries(input.snapshot)) {
    if (!input.current[key]) deletes.push({ key });
  }
  return { inserts, updates, deletes, unchanged };
};

const hashRow = (row: Record<string, unknown>): string => {
  const ordered = Object.keys(row)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = row[k];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
};

export const inferSchemaFingerprint = (plan: IImportPlan): string => {
  const parts = plan.fields.map((f) => `${f.name}:${f.type}`).join('|');
  return createHash('sha256').update(parts).digest('hex');
};
