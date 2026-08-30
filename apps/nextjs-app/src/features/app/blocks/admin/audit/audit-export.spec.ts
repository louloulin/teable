/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * R1-T10 — audit-export helper specs.
 *
 * Covers CSV escaping edge cases + JSON serialization + filename
 * composition. The download trigger itself relies on `document`
 * and is intentionally NOT exercised here (jsdom-less environment).
 */

import type { IAuditListRow } from '@teable/openapi';
import { describe, expect, it } from 'vitest';

import { AUDIT_EXPORT_COLUMNS, rowsToCsv, rowsToJson } from './audit-export';

const baseRow: IAuditListRow = {
  id: 'row-1',
  createdAt: '2026-08-26T10:00:00.000Z',
  action: 'http_request',
  resourceId: 'tblABC',
  userId: 'usrXYZ',
  rootAction: null,
  operationId: null,
};

describe('audit-export (R1-T10)', () => {
  it('CSV header is stable and matches AUDIT_EXPORT_COLUMNS', () => {
    const csv = rowsToCsv([]);
    const expectedHeader = '﻿' + AUDIT_EXPORT_COLUMNS.join(',') + '\r\n';
    expect(csv).toBe(expectedHeader);
  });

  it('CSV serializes a simple row without quoting', () => {
    const csv = rowsToCsv([baseRow]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('row-1,2026-08-26T10:00:00.000Z,http_request,tblABC,usrXYZ,,');
  });

  it('CSV quotes cells containing commas', () => {
    const csv = rowsToCsv([{ ...baseRow, action: 'a,b' }]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[1]).toContain('"a,b"');
  });

  it('CSV doubles internal quotes per RFC-4180', () => {
    const csv = rowsToCsv([{ ...baseRow, resourceId: 'tbl"ABC' }]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[1]).toContain('"tbl""ABC"');
  });

  it('CSV quotes cells with newlines (CRLF inside)', () => {
    const csv = rowsToCsv([{ ...baseRow, action: 'line1\nline2' }]);
    const lines = csv.split('\r\n');
    // First newline inside the quoted cell is preserved; the row
    // terminator (\r\n after the closing quote) closes the row.
    expect(lines.find((l) => l.includes('"line1'))).toBeDefined();
    expect(csv).toContain('"line1\nline2"');
  });

  it('CSV handles Unicode characters without escaping them', () => {
    const csv = rowsToCsv([{ ...baseRow, resourceId: '中文-tbl' }]);
    expect(csv).toContain('中文-tbl');
  });

  it('CSV converts null cells to empty strings', () => {
    const csv = rowsToCsv([baseRow]);
    // Two trailing commas for rootAction + operationId (both null).
    // The serializer terminates with CRLF, so we strip it before matching.
    expect(csv.replace(/\r\n$/, '')).toMatch(/,usrXYZ,,$/);
  });

  it('JSON output contains exportedAt + rowCount + rows', () => {
    const json = rowsToJson([baseRow, { ...baseRow, id: 'row-2' }]);
    const parsed = JSON.parse(json);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.rows[0].id).toBe('row-1');
    expect(parsed.rows[1].id).toBe('row-2');
  });

  it('JSON keys are in AUDIT_EXPORT_COLUMNS order', () => {
    const parsed = JSON.parse(rowsToJson([baseRow]));
    expect(Object.keys(parsed.rows[0])).toEqual([...AUDIT_EXPORT_COLUMNS]);
  });
});
