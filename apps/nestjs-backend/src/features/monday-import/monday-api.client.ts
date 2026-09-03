import { Injectable, Logger } from '@nestjs/common';
import type {
  MondayBoard,
  MondayItem,
  MondayWorkspace,
} from './monday-import.types';

/**
 * Round-19: Minimal Monday.com GraphQL API client. Provides:
 *   - probe() — query workspaces + boards
 *   - listWorkspaces() — query { workspaces { id name } }
 *   - listBoards() — query { boards { id name } }
 *   - listItems() — query { boards(ids:...) { items_page { items {...} } } }
 *
 * Round-39: adds `listItems(boardId, limit, cursor)` so the
 * record-creation path can paginate via monday.com's GraphQL
 * `items_page(limit: N, cursor: "...")` cursor. Capped at 500 pages.
 *
 * Auth: Authorization header with personal API token (no prefix).
 * Monday API is GraphQL — one endpoint, many queries via POST body.
 */
@Injectable()
export class MondayApiClient {
  private readonly logger = new Logger(MondayApiClient.name);
  private readonly endpoint = 'https://api.monday.com/v2';

  constructor(private readonly token: string) {}

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Monday GraphQL failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Monday GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
    }
    return json.data as T;
  }

  async listWorkspaces(): Promise<MondayWorkspace[]> {
    const data = await this.graphql<{ workspaces: MondayWorkspace[] }>(`
      query { workspaces { id name kind } }
    `);
    return data.workspaces ?? [];
  }

  async listBoards(limit = 25): Promise<MondayBoard[]> {
    const data = await this.graphql<{ boards: MondayBoard[] }>(`
      query ($limit: Int!) {
        boards(limit: $limit) {
          id name board_kind workspace_id items_count
        }
      }
    `, { limit });
    return data.boards ?? [];
  }

  /**
   * List items on a board. Returns both `items` (capped at `limit`)
   * and the cursor for the next page (Round-39).
   */
  async listItems(
    boardId: string,
    limit = 100,
    cursor?: string
  ): Promise<{ items: MondayItem[]; nextCursor: string | null }> {
    const variables: Record<string, unknown> = { boardId: [boardId], limit };
    if (cursor) variables['cursor'] = cursor;
    const data = await this.graphql<{
      boards: Array<{ items_page: { items: MondayItem[]; cursor: string | null } }>;
    }>(
      `query ($boardId: [ID!], $limit: Int!, $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id name
              board { id name }
              group { id title }
              column_values { id value text }
              created_at updated_at
            }
          }
        }
      }`,
      variables
    );
    const page = data.boards?.[0]?.items_page;
    return {
      items: page?.items ?? [],
      nextCursor: page?.cursor ?? null,
    };
  }

  async probe(): Promise<{
    ok: boolean;
    workspaceCount?: number;
    boardCount?: number;
    error?: string;
  }> {
    try {
      const workspaces = await this.listWorkspaces();
      const boards = await this.listBoards(10);
      return {
        ok: true,
        workspaceCount: workspaces.length,
        boardCount: boards.length,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`monday probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
