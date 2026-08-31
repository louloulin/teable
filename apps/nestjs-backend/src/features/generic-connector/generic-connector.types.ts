/**
 * Generic Connector — Round-23 minimal types.
 *
 * Pattern: driver registry + pluggable fetch logic. Unlike the source-
 * specific drivers (airtable/baserow/clickup/jira/monday/nocodb/smartsheet/
 * smartsuite), the generic connector accepts an arbitrary "source spec"
 * (endpoint + token + adapterType) and routes to a registered adapter.
 *
 * Built-in adapters ship in this module; new adapters can be registered
 * at runtime via the registry API. This unblocks the connect_more_sources
 * cloudGap entry without writing per-vendor code.
 */

export type GenericAdapterType = 'rest-api' | 'json-endpoint' | 'csv-url';

export interface GenericSourceSpec {
  /** Adapter name; must match a registered adapter code. */
  adapterType: GenericAdapterType | string;
  /** Source endpoint URL (http(s) for HTTP-based, file:// for files in future). */
  endpoint: string;
  /** Auth token (Bearer-style; injected into Authorization header). */
  token?: string;
  /** Optional HTTP method override (default GET for json-endpoint, POST for rest-api paginated). */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Optional custom headers. */
  headers?: Record<string, string>;
  /** Optional path expression to locate records (e.g. "data.items" for nested arrays). */
  recordsPath?: string;
  /** Pagination hint — adapters honor "offset" or "page" when provided. */
  pagination?: {
    style?: 'offset' | 'page' | 'none';
    limit?: number;
    offsetParam?: string;
    limitParam?: string;
  };
  /** Free-form metadata, surfaced back in probe responses. */
  meta?: Record<string, string>;
}

export interface GenericRecord {
  id?: string;
  [key: string]: unknown;
}

export interface GenericFetchResult {
  ok: boolean;
  adapterType: string;
  endpoint: string;
  count?: number;
  sample?: GenericRecord[];
  totalBytes?: number;
  durationMs?: number;
  error?: string;
  fetchedAt: string;
}

export interface GenericAdapterInfo {
  type: string;
  displayName: string;
  description: string;
  builtin: boolean;
  registeredAt: string;
}

export interface GenericConnectionProbe {
  ok: boolean;
  adapterCount?: number;
  builtinTypes?: string[];
  error?: string;
  fetchedAt: string;
}
