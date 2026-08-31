/**
 * Monday Import — Round-19 minimal types.
 *
 * Monday.com GraphQL API at https://api.monday.com/v2
 * Auth: Authorization header with personal API token (no Bearer prefix).
 * Hierarchy: Workspace > Board > Group > Item (with column_values).
 */

export interface MondayWorkspace {
  id: string;
  name: string;
  kind?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  board_kind?: string;
  workspace_id?: string;
  items_count?: number;
}

export interface MondayItem {
  id: string;
  name: string;
  board?: { id: string; name: string };
  group?: { id: string; title: string };
  column_values?: Array<{ id: string; value: string; text: string | null }>;
  created_at?: string;
  updated_at?: string;
}

export interface MondayConnectionProbe {
  ok: boolean;
  workspaceCount?: number;
  boardCount?: number;
  error?: string;
  fetchedAt: string;
}
