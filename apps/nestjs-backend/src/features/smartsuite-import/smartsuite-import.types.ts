/**
 * SmartSuite Import — Round-22 minimal types.
 *
 * SmartSuite REST API at https://api.smartsuite.com/api/v1/
 * Auth: Authorization header with Bearer access token.
 * Hierarchy: Solution > App > Table > Record (with field values).
 */

export interface SmartSuiteApp {
  id: string;
  name: string;
  structure?: Array<{ id: string; name: string; type: string }>;
}

export interface SmartSuiteTable {
  id: string;
  name: string;
  structure?: Array<{ id: string; name: string; type: string }>;
}

export interface SmartSuiteRecord {
  id: string;
  app_id?: string;
  table_id?: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  fields?: Record<string, unknown>;
}

export interface SmartSuiteConnectionProbe {
  ok: boolean;
  appCount?: number;
  tableCount?: number;
  user?: { id: string; email: string };
  error?: string;
  fetchedAt: string;
}
