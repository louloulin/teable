import { Injectable, Logger } from '@nestjs/common';
import type {
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
} from './clickup-import.types';

/**
 * Round-17: Minimal ClickUp REST API client. Only the calls needed to
 * (1) verify credentials, (2) list spaces, (3) list tasks in a list.
 *
 * Round-40: adds `listTasks(listId, pageSize, page, includeClosed)` so
 * the record-creation path can paginate via ClickUp's `?page=N&limit=M`
 * with the `last_page` flag telling us when to stop.
 *
 * ClickUp API base URL is https://api.clickup.com/api/v2/
 * The user provides the personal token; we attach it as Authorization.
 */
@Injectable()
export class ClickUpApiClient {
  private readonly logger = new Logger(ClickUpApiClient.name);

  constructor(private readonly token: string) {}

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `https://api.clickup.com/api/v2${path}`;
    const res = await fetch(url, {
      headers: { Authorization: this.token },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `ClickUp API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listSpaces(teamId: string): Promise<ClickUpSpace[]> {
    const data = await this.fetchJson<{ spaces: ClickUpSpace[] }>(
      `/team/${teamId}/space?archived=false`
    );
    return data.spaces ?? [];
  }

  async listLists(spaceId: string, archived = false): Promise<ClickUpList[]> {
    const data = await this.fetchJson<{ lists: ClickUpList[] }>(
      `/space/${spaceId}/list?archived=${archived}`
    );
    return data.lists ?? [];
  }

  /**
   * List tasks in a list. Returns both `tasks` (capped at `pageSize`)
   * and `lastPage` (Round-40) so the caller knows when pagination ends.
   *
   * @param listId        numeric or alphanumeric ClickUp list id
   * @param pageSize      page size (default 100)
   * @param page          page index (0-based; Round-40)
   * @param includeClosed include archived/done tasks (default false)
   */
  async listTasks(
    listId: string,
    pageSize = 100,
    page = 0,
    includeClosed = false
  ): Promise<{ tasks: ClickUpTask[]; lastPage: boolean }> {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    params.set('include_closed', String(includeClosed));
    const data = await this.fetchJson<{ tasks: ClickUpTask[]; last_page?: boolean }>(
      `/list/${listId}/task?${params.toString()}`
    );
    return {
      tasks: data.tasks ?? [],
      lastPage: Boolean(data.last_page),
    };
  }

  async probe(): Promise<{
    ok: boolean;
    workspaceId?: number;
    workspaceName?: string;
    spaceCount?: number;
    error?: string;
  }> {
    try {
      // GET /team — returns all workspaces (called "teams" in ClickUp API) the user has access to
      const data = await this.fetchJson<{ teams: Array<{ id: string; name: string }> }>(
        '/team'
      );
      const team = data.teams?.[0];
      if (!team) return { ok: false, error: 'no workspace accessible with this token' };

      const spaces = await this.listSpaces(team.id);
      return {
        ok: true,
        workspaceId: Number(team.id),
        workspaceName: team.name,
        spaceCount: spaces.length,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`clickup probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
