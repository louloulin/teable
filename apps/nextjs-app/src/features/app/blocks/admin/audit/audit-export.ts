/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Audit-log export utilities (R1-T10).
 *
 * Provides vanilla CSV / JSON serialization for `IAuditListRow[]` plus a
 * `triggerDownload` helper that creates a Blob and clicks a hidden link.
 * Zero new npm dependencies — uses URL.createObjectURL + document.body.
 */

import type { IAuditListRow } from '@teable/openapi';

/** Stable column order for both CSV and JSON outputs. */
export const AUDIT_EXPORT_COLUMNS = [
  'id',
  'createdAt',
  'action',
  'resourceType',
  'resourceId',
  'userId',
  'payload',
  'rootAction',
  'operationId',
] as const satisfies ReadonlyArray<keyof IAuditListRow>;

export type AuditExportFormat = 'csv' | 'json';

/** Serialize audit rows as RFC-4180 CSV with explicit BOM for Excel. */
export function rowsToCsv(rows: ReadonlyArray<IAuditListRow>): string {
  const header = AUDIT_EXPORT_COLUMNS.join(',');
  const lines = rows.map((row) => AUDIT_EXPORT_COLUMNS.map((col) => csvEscape(row[col])).join(','));
  // Prepend UTF-8 BOM so Excel auto-detects the encoding.
  return '﻿' + [header, ...lines].join('\r\n') + '\r\n';
}

/** Serialize audit rows as pretty-printed JSON. */
export function rowsToJson(rows: ReadonlyArray<IAuditListRow>): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows: rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of AUDIT_EXPORT_COLUMNS) {
        out[col] = row[col];
      }
      return out;
    }),
  };
  return JSON.stringify(payload, null, 2);
}

/** Trigger a browser download of the given payload under the given filename. */
export function triggerDownload(payload: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the click event has time
  // to register on slow browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Convenience — serialize + download in one call. */
export function exportAuditRows(
  rows: ReadonlyArray<IAuditListRow>,
  format: AuditExportFormat
): string {
  const payload = format === 'csv' ? rowsToCsv(rows) : rowsToJson(rows);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `audit-log-${stamp}.${format}`;
  const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
  triggerDownload(payload, filename, mime);
  return filename;
}

/** RFC-4180 CSV cell escape: wrap in quotes if the value contains
 *  comma, double-quote, CR, or LF; double internal quotes. */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
