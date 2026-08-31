/**
 * NocoDB Import — Round-20 minimal types.
 *
 * NocoDB REST API at <host>/api/v1/
 * Auth: xc-token header (API token) for protected resources.
 * Hierarchy: Base > Table > View > Row.
 */

export interface NocoDbBase {
  id: string;
  title: string;
  type?: string;
  status?: string;
}

export interface NocoDbTable {
  id: string;
  title: string;
  base_id?: string;
  fields?: Array<{ id: string; title: string; uidt?: string }>;
}

export interface NocoDbRow {
  id: string;
  [column: string]: unknown;
}

export interface NocoDbConnectionProbe {
  ok: boolean;
  baseCount?: number;
  tableCount?: number;
  error?: string;
  fetchedAt: string;
}
