/**
 * Baserow Import — Round-16 minimal types.
 *
 * Baserow exposes a REST API at https://api.baserow.io/api/database/rows/...
 * Each row is a JSON object keyed by field name. Unlike Airtable, Baserow
 * does not have formulas/rollups as first-class — field types are simpler.
 * This keeps the conversion logic straightforward.
 */

export interface BaserowField {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
}

export interface BaserowTableSchema {
  id: number;
  name: string;
  fields: BaserowField[];
}

export interface BaserowRow {
  id: number;
  order: string;
  [fieldName: string]: unknown;
}

export interface BaserowConnectionProbe {
  ok: boolean;
  baseId: number;
  workspaceName?: string;
  tableCount?: number;
  error?: string;
  fetchedAt: string;
}
