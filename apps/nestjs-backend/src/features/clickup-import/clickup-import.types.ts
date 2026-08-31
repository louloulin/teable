/**
 * ClickUp Import — Round-17 minimal types.
 *
 * ClickUp hierarchy: Workspace > Space > Folder > List > Task
 * API base: https://api.clickup.com/api/v2/
 * Auth: Authorization header with personal token.
 */

export interface ClickUpSpace {
  id: string;
  name: string;
  private?: boolean;
  statuses?: Array<{ id: string; status: string; color: string }>;
}

export interface ClickUpList {
  id: string;
  name: string;
  folder?: { id: string; name: string };
  space?: { id: string; name: string };
  task_count?: number;
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status?: { status: string; color: string };
  assignees?: Array<{ id: number; username: string }>;
  due_date?: string | null;
  priority?: { id: string; priority: string };
  [fieldName: string]: unknown;
}

export interface ClickUpConnectionProbe {
  ok: boolean;
  workspaceId?: number;
  workspaceName?: string;
  spaceCount?: number;
  error?: string;
  fetchedAt: string;
}
