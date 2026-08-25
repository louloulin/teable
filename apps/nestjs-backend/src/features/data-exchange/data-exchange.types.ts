/**
 * Data import / export — Stage 54.
 *
 * Three formats are supported: CSV, JSON, and a portable XLSX
 * (we read/write the OOXML shape with no external dependency). JSON
 * is the canonical exchange format; CSV + XLSX are derived.
 *
 * The architecture keeps parsing/serialization in pure helpers and
 * uses a pluggable "row store" interface so tests can run without
 * Prisma.
 */

export type ExportFormat = 'csv' | 'json' | 'xlsx';
export type ImportFormat = ExportFormat;

export interface IColumn {
  id: string;
  name: string;
  /** Optional type hint used during import validation. */
  type?: 'string' | 'number' | 'boolean' | 'date' | 'json';
}

export interface IRow {
  id?: string;
  cells: Record<string, unknown>;
}

export interface ITableData {
  tableId: string;
  columns: ReadonlyArray<IColumn>;
  rows: ReadonlyArray<IRow>;
}

export interface IExportResult {
  format: ExportFormat;
  contentType: string;
  /** Base64 when binary, raw string when text. */
  body: string;
  /** Original byte length (before base64). */
  byteLength: number;
  rowCount: number;
}

export interface IImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ReadonlyArray<{ rowIndex: number; message: string }>;
}

export interface IRowStore {
  /** Insert rows into the underlying table. Returns inserted ids. */
  insert(args: { tableId: string; rows: ReadonlyArray<IRow> }): Promise<ReadonlyArray<string>>;
}

export const MAX_IMPORT_ROWS = 50_000;
export const MAX_CELL_BYTES = 64 * 1024;
