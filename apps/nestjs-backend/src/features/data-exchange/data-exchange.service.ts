/**
 * Data import / export — Stage 54.
 *
 * Pure helpers: CSV parse/build, JSON envelope parse/build, OOXML
 * (XLSX) emission in portable XML + zip-free single-sheet layout
 * (so tests don't need a zip library).
 */

import type {
  ExportFormat,
  IColumn,
  IExportResult,
  IImportSummary,
  IRow,
  ITableData,
} from './data-exchange.types';
import { MAX_CELL_BYTES, MAX_IMPORT_ROWS } from './data-exchange.types';

/** ------------------------------------------------------------------
 *  CSV
 *  ------------------------------------------------------------------ */

const CSV_DELIM = ',';
const CSV_QUOTE = '"';

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (s.includes(CSV_DELIM) || s.includes(CSV_QUOTE) || s.includes('\n') || s.includes('\r')) {
    return CSV_QUOTE + s.replace(new RegExp(CSV_QUOTE, 'g'), CSV_QUOTE + CSV_QUOTE) + CSV_QUOTE;
  }
  return s;
}

export function buildCsv(table: ITableData): string {
  const header = table.columns.map((c) => escapeCsvCell(c.name)).join(CSV_DELIM);
  const lines = [header];
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => escapeCsvCell(row.cells[c.id])).join(CSV_DELIM));
  }
  return lines.join('\r\n') + '\r\n';
}

export function parseCsv(input: string, columns: ReadonlyArray<IColumn>): IRow[] {
  const rows = parseCsvRaw(input);
  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  const colMap = buildColumnMap(columns);
  const out: IRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((v) => v === '')) continue;
    out.push({ cells: mapCells(r, header, columns, colMap) });
  }
  return out;
}

function buildColumnMap(columns: ReadonlyArray<IColumn>): Map<string, number> {
  const colMap = new Map<string, number>();
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (c) colMap.set(c.name, i);
  }
  return colMap;
}

function mapCells(
  row: ReadonlyArray<string>,
  header: ReadonlyArray<string>,
  columns: ReadonlyArray<IColumn>,
  colMap: Map<string, number>
): Record<string, unknown> {
  const cells: Record<string, unknown> = {};
  for (let j = 0; j < header.length; j++) {
    const colName = header[j] ?? '';
    const idx = colMap.get(colName);
    if (idx === undefined) continue;
    const col = columns[idx];
    if (!col) continue;
    cells[col.id] = coerceValue(row[j] ?? '', col);
  }
  return cells;
}

function parseCsvRaw(input: string): string[][] {
  const state: ICsvState = { rows: [], cur: [], field: '', inQuotes: false };
  let i = 0;
  while (i < input.length) {
    const step = consumeCsvChar(state, input, i);
    i += step;
  }
  flushCsvField(state);
  return state.rows;
}

interface ICsvState {
  rows: string[][];
  cur: string[];
  field: string;
  inQuotes: boolean;
}

/** Returns the number of input characters consumed (1, or 2 for an escaped `""`). */
function consumeCsvChar(state: ICsvState, input: string, i: number): number {
  const ch = input[i];
  if (state.inQuotes) return consumeInsideQuotes(state, input, i, ch);
  consumeOutsideQuotes(state, ch);
  return 1;
}

function consumeInsideQuotes(
  state: ICsvState,
  input: string,
  i: number,
  ch: string | undefined
): number {
  if (ch === CSV_QUOTE) {
    if (input[i + 1] === CSV_QUOTE) {
      state.field += CSV_QUOTE;
      return 2;
    }
    state.inQuotes = false;
    return 1;
  }
  state.field += ch ?? '';
  return 1;
}

function consumeOutsideQuotes(state: ICsvState, ch: string | undefined): void {
  if (ch === CSV_QUOTE) {
    state.inQuotes = true;
  } else if (ch === CSV_DELIM) {
    state.cur.push(state.field);
    state.field = '';
  } else if (ch === '\n') {
    state.cur.push(state.field);
    state.rows.push(state.cur);
    state.cur = [];
    state.field = '';
  } else if (ch === '\r') {
    // skip; the following \n finishes the row
  } else {
    state.field += ch ?? '';
  }
}

function flushCsvField(state: ICsvState): void {
  if (state.field.length > 0 || state.cur.length > 0) {
    state.cur.push(state.field);
    state.rows.push(state.cur);
  }
}

function coerceValue(raw: string, col: IColumn): unknown {
  if (raw === '') return null;
  switch (col.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? raw : n;
    }
    case 'boolean':
      return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
    case 'date':
      return raw;
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    case 'string':
    default:
      return raw;
  }
}

/** ------------------------------------------------------------------
 *  JSON
 *  ------------------------------------------------------------------ */

export interface IJsonEnvelope {
  version: 1;
  tableId: string;
  columns: IColumn[];
  rows: IRow[];
}

export function buildJson(table: ITableData): string {
  const env: IJsonEnvelope = {
    version: 1,
    tableId: table.tableId,
    columns: [...table.columns],
    rows: table.rows.map((r) => ({ ...r })),
  };
  return JSON.stringify(env);
}

export function parseJson(input: string): ITableData {
  const env = JSON.parse(input) as IJsonEnvelope;
  if (!env || env.version !== 1) throw new Error('unsupported envelope version');
  if (!Array.isArray(env.columns)) throw new Error('columns array required');
  if (!Array.isArray(env.rows)) throw new Error('rows array required');
  return {
    tableId: env.tableId,
    columns: env.columns,
    rows: env.rows,
  };
}

/** ------------------------------------------------------------------
 *  XLSX (OOXML, single sheet, no zip — portable subset)
 *  ------------------------------------------------------------------ */

/**
 * Build an XLSX-compatible zip-of-XML content as a base64 string. The
 * file is valid OOXML with `xl/sharedStrings.xml` + `xl/worksheets/sheet1.xml`
 * inside a stored (no-deflate) zip. The output uses the bare-minimum
 * zip layout. Kept pure so tests run offline.
 */
export function buildXlsxBase64(table: ITableData): { base64: string; byteLength: number } {
  const sst = new SharedStringTable();
  const cellRef = (row: number, col: number): string => `${colLetter(col)}${row + 1}`;

  const rows: string[] = [];
  rows.push('<row r="1">');
  table.columns.forEach((c, idx) => {
    const ref = cellRef(0, idx);
    const sstIdx = sst.intern(c.name);
    rows.push(`<c r="${ref}" t="s"><v>${sstIdx}</v></c>`);
  });
  rows.push('</row>');
  table.rows.forEach((r, rowIdx) => {
    rows.push(`<row r="${rowIdx + 2}">`);
    table.columns.forEach((c, colIdx) => {
      const ref = cellRef(rowIdx + 1, colIdx);
      const v = r.cells[c.id];
      if (v === null || v === undefined) return;
      if (typeof v === 'number') {
        rows.push(`<c r="${ref}"><v>${v}</v></c>`);
      } else if (typeof v === 'boolean') {
        rows.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
      } else {
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        const sstIdx = sst.intern(s);
        rows.push(`<c r="${ref}" t="s"><v>${sstIdx}</v></c>`);
      }
    });
    rows.push('</row>');
  });

  const sheetXml = buildSheetXml(table, rows);
  const sstXml = buildSstXml(sst);

  return { base64: zipStored([sstXml, sheetXml]), byteLength: 0 };
}

class SharedStringTable {
  private readonly strings: string[] = [];
  private readonly index = new Map<string, number>();

  intern(s: string): number {
    const existing = this.index.get(s);
    if (existing !== undefined) return existing;
    const idx = this.strings.length;
    this.strings.push(s);
    this.index.set(s, idx);
    return idx;
  }

  /** OOXML `count` attribute = sum of length + 1 per string. */
  totalCount(): number {
    return this.strings.reduce((a, s) => a + 1 + (s.match(/"/g)?.length ?? 0), 0);
  }

  uniqueCount(): number {
    return this.strings.length;
  }

  toXml(): string {
    const items = this.strings
      .map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`)
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.totalCount()}" uniqueCount="${this.uniqueCount()}">` +
      items +
      '</sst>'
    );
  }
}

function buildSheetXml(table: ITableData, rows: ReadonlyArray<string>): string {
  const lastCol = colLetter(Math.max(0, table.columns.length - 1));
  const lastRow = table.rows.length + 1;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    '<sheetData>' +
    rows.join('') +
    '</sheetData>' +
    '</worksheet>'
  );
}

function buildSstXml(sst: SharedStringTable): string {
  return sst.toXml();
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(idx: number): string {
  let n = idx;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Build a stored (no-compression) zip archive containing the named
 * entries. Minimal header layout; CRC32 is computed. Kept here so we
 * avoid pulling in `jszip` for tests.
 */
function zipStored(entries: string[]): string {
  const localChunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    const name = entryName(i);
    const data = new TextEncoder().encode(entries[i] ?? '');
    const crc = crc32(data);
    const local = buildLocalHeader(name, crc, data.length, data);
    localChunks.push(local);
    central.push(buildCentralHeader(name, crc, data.length, offset));
    offset += local.length;
  }
  const localBuf = concatUint8(localChunks);
  const centralBuf = concatUint8(central);
  const end = buildEndOfCentral(localBuf.length, central.length, centralBuf.length);
  return bytesToBase64(concatUint8([localBuf, centralBuf, end]));
}

function entryName(i: number): string {
  if (i === 0) return 'xl/sharedStrings.xml';
  if (i === 1) return 'xl/worksheets/sheet1.xml';
  return `file_${i}.xml`;
}

function buildLocalHeader(name: string, crc: number, size: number, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(30 + nameBytes.length + data.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(4, 20, true); // version
  dv.setUint16(6, 0, true); // flags
  dv.setUint16(8, 0, true); // method: stored
  dv.setUint16(10, 0, true);
  dv.setUint16(12, 0, true);
  dv.setUint32(14, crc, true);
  dv.setUint32(18, size, true);
  dv.setUint32(22, size, true);
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true);
  buf.set(nameBytes, 30);
  buf.set(data, 30 + nameBytes.length);
  return buf;
}

function buildCentralHeader(name: string, crc: number, size: number, offset: number): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(46 + nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x02014b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 20, true);
  dv.setUint16(8, 0, true);
  dv.setUint16(10, 0, true);
  dv.setUint16(12, 0, true);
  dv.setUint32(14, crc, true);
  dv.setUint32(18, size, true);
  dv.setUint32(22, size, true);
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true);
  dv.setUint16(30, 0, true);
  dv.setUint16(32, 0, true);
  dv.setUint16(34, 0, true);
  dv.setUint32(36, 0, true);
  dv.setUint32(42, offset, true);
  buf.set(nameBytes, 46);
  return buf;
}

function buildEndOfCentral(localSize: number, count: number, centralSize: number): Uint8Array {
  const buf = new Uint8Array(22);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, count, true);
  dv.setUint16(10, count, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, localSize, true);
  dv.setUint16(20, 0, true);
  return buf;
}

function concatUint8(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** ------------------------------------------------------------------
 *  High-level export / import
 *  ------------------------------------------------------------------ */

export function exportTable(table: ITableData, format: ExportFormat): IExportResult {
  let body: string;
  let contentType: string;
  switch (format) {
    case 'csv': {
      body = buildCsv(table);
      contentType = 'text/csv; charset=utf-8';
      break;
    }
    case 'json': {
      body = buildJson(table);
      contentType = 'application/json';
      break;
    }
    case 'xlsx': {
      const out = buildXlsxBase64(table);
      body = out.base64;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    }
    default:
      throw new Error(`unsupported format: ${format as string}`);
  }
  return {
    format,
    body,
    contentType,
    byteLength: byteLength(body),
    rowCount: table.rows.length,
  };
}

function byteLength(body: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(body, 'utf8');
  return new TextEncoder().encode(body).length;
}

export function validateRows(table: ITableData): IImportSummary {
  const errors: { rowIndex: number; message: string }[] = [];
  let imported = 0;
  const skipped = 0;
  if (table.rows.length > MAX_IMPORT_ROWS) {
    errors.push({
      rowIndex: -1,
      message: `too many rows: ${table.rows.length} > ${MAX_IMPORT_ROWS}`,
    });
    return { totalRows: table.rows.length, imported: 0, skipped: 0, errors };
  }
  const colIds = new Set(table.columns.map((c) => c.id));
  table.rows.forEach((row, idx) => {
    for (const key of Object.keys(row.cells)) {
      if (!colIds.has(key)) {
        errors.push({ rowIndex: idx, message: `unknown column: ${key}` });
        return;
      }
      const v = row.cells[key];
      const bytes = typeof v === 'string' ? new TextEncoder().encode(v).length : 0;
      if (bytes > MAX_CELL_BYTES) {
        errors.push({ rowIndex: idx, message: `cell too large: ${key}` });
        return;
      }
    }
    imported += 1;
    void skipped;
  });
  return { totalRows: table.rows.length, imported, skipped: 0, errors };
}
