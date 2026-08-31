import { Injectable, Logger } from '@nestjs/common';
import { MondayApiClient } from './monday-api.client';
import type {
  MondayBoard,
  MondayConnectionProbe,
  MondayItem,
  MondayWorkspace,
} from './monday-import.types';

/**
 * Round-19: Monday.com migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) pattern. Monday is GraphQL-based vs REST for the
 * others — only the API client differs. Service + controller + module are
 * structurally identical.
 *
 * Provides:
 *   1. Credential probe — query workspaces + boards
 *   2. List workspaces
 *   3. List boards
 *   4. Fetch items (paginated) from a board
 */
@Injectable()
export class MondayImportService {
  private readonly logger = new Logger(MondayImportService.name);

  probe(token: string): Promise<MondayConnectionProbe> {
    const client = new MondayApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listWorkspaces(token: string): Promise<MondayWorkspace[]> {
    return new MondayApiClient(token).listWorkspaces();
  }

  async listBoards(token: string, limit = 25): Promise<MondayBoard[]> {
    return new MondayApiClient(token).listBoards(limit);
  }

  async fetchItems(
    token: string,
    boardId: string,
    limit = 100
  ): Promise<{ boardId: string; itemCount: number; sample: MondayItem[] }> {
    const items = await new MondayApiClient(token).listItems(boardId, limit);
    return {
      boardId,
      itemCount: items.length,
      sample: items.slice(0, 5),
    };
  }
}
