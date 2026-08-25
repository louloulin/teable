/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildCsv,
  buildJson,
  buildXlsxBase64,
  escapeCsvCell,
  exportTable,
  parseCsv,
  parseJson,
  validateRows,
} from './data-exchange.service';
import type { IColumn, ITableData } from './data-exchange.types';

function mkTable(): ITableData {
  const cols: IColumn[] = [
    { id: 'name', name: 'Name', type: 'string' },
    { id: 'count', name: 'Count', type: 'number' },
    { id: 'active', name: 'Active', type: 'boolean' },
  ];
  return {
    tableId: 'tbl',
    columns: cols,
    rows: [
      { id: 'r1', cells: { name: 'Alice', count: 3, active: true } },
      { id: 'r2', cells: { name: 'Bob, Jr.', count: 7, active: false } },
      { id: 'r3', cells: { name: 'multi\nline', count: 0, active: true } },
    ],
  };
}

describe('data-exchange.csv', () => {
  it('escapes commas, quotes, newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('plain')).toBe('plain');
  });

  it('builds a CSV with header + rows', () => {
    const csv = buildCsv(mkTable());
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Name,Count,Active');
    expect(lines[1]).toBe('Alice,3,true');
    expect(lines[2]).toBe('"Bob, Jr.",7,false');
  });

  it('parses a CSV back to rows', () => {
    const t = mkTable();
    const csv = buildCsv(t);
    const parsed = parseCsv(csv, t.columns);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.cells.name).toBe('Alice');
    expect(parsed[1]?.cells.name).toBe('Bob, Jr.');
    expect(parsed[2]?.cells.name).toBe('multi\nline');
  });

  it('handles quoted fields with embedded quotes', () => {
    const csv = 'Name,Count\n"he said ""hi""",1\n';
    const cols: IColumn[] = [
      { id: 'name', name: 'Name', type: 'string' },
      { id: 'count', name: 'Count', type: 'number' },
    ];
    const parsed = parseCsv(csv, cols);
    expect(parsed[0]?.cells.name).toBe('he said "hi"');
    expect(parsed[0]?.cells.count).toBe(1);
  });

  it('coerces number / boolean', () => {
    const csv = 'Name,Count,Active\nAlice,5,false\n';
    const parsed = parseCsv(csv, mkTable().columns);
    expect(parsed[0]?.cells.count).toBe(5);
    expect(parsed[0]?.cells.active).toBe(false);
  });

  it('skips empty rows', () => {
    const csv = 'Name,Count\n\n\nAlice,1\n';
    const parsed = parseCsv(csv, mkTable().columns);
    expect(parsed).toHaveLength(1);
  });
});

describe('data-exchange.json', () => {
  it('round-trips through JSON envelope', () => {
    const t = mkTable();
    const out = parseJson(buildJson(t));
    expect(out.tableId).toBe('tbl');
    expect(out.columns).toHaveLength(3);
    expect(out.rows[0]?.cells.name).toBe('Alice');
  });

  it('rejects bad version', () => {
    expect(() => parseJson('{"version":2}')).toThrow();
  });
});

describe('data-exchange.xlsx', () => {
  it('builds a valid OOXML zip (base64)', () => {
    const out = buildXlsxBase64(mkTable());
    expect(out.base64).toMatch(/^[A-Z0-9+/=]+$/i);
    // 4-byte signature + ...
    const bytes = Buffer.from(out.base64, 'base64');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe('data-exchange.export', () => {
  it('exports CSV', () => {
    const out = exportTable(mkTable(), 'csv');
    expect(out.format).toBe('csv');
    expect(out.contentType).toContain('text/csv');
    expect(out.rowCount).toBe(3);
    expect(out.body).toContain('Name,Count,Active');
  });
  it('exports JSON', () => {
    const out = exportTable(mkTable(), 'json');
    expect(out.format).toBe('json');
    expect(out.body).toContain('"version":1');
  });
  it('exports XLSX', () => {
    const out = exportTable(mkTable(), 'xlsx');
    expect(out.format).toBe('xlsx');
    expect(out.contentType).toContain('spreadsheetml');
    expect(out.body.length).toBeGreaterThan(0);
  });
  it('rejects unknown format', () => {
    expect(() => exportTable(mkTable(), 'xml' as never)).toThrow();
  });
});

describe('data-exchange.validate', () => {
  it('accepts valid rows', () => {
    const out = validateRows(mkTable());
    expect(out.imported).toBe(3);
    expect(out.errors).toEqual([]);
  });
  it('rejects unknown columns', () => {
    const t = mkTable();
    t.rows[0]!.cells.unknown = 'x';
    const out = validateRows(t);
    expect(out.errors.length).toBeGreaterThan(0);
  });
  it('rejects oversized cells', () => {
    const t = mkTable();
    t.rows[0]!.cells.name = 'x'.repeat(70 * 1024);
    const out = validateRows(t);
    expect(out.errors[0]?.message).toContain('too large');
  });
});
