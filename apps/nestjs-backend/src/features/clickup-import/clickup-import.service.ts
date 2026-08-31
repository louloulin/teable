import { Injectable, Logger } from '@nestjs/common';
import { ClickUpApiClient } from './clickup-api.client';
import type {
  ClickUpConnectionProbe,
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
} from './clickup-import.types';

/**
 * Round-17: ClickUp migration driver (minimal). Mirrors the baserow-import
 * pattern from Round-16. Provides:
 *   1. Token probe — verify personal access token against /team endpoint
 *   2. List spaces within a workspace
 *   3. List lists within a space
 *   4. Fetch tasks (paginated) from a list
 *
 * The actual translation from ClickUp tasks → Teable records happens
 * downstream (separate translate step).
 */
@Injectable()
export class ClickUpImportService {
  private readonly logger = new Logger(ClickUpImportService.name);

  probe(token: string): Promise<ClickUpConnectionProbe> {
    const client = new ClickUpApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listSpaces(token: string, teamId: string): Promise<ClickUpSpace[]> {
    const client = new ClickUpApiClient(token);
    return client.listSpaces(teamId);
  }

  async listLists(token: string, spaceId: string): Promise<ClickUpList[]> {
    const client = new ClickUpApiClient(token);
    return client.listLists(spaceId);
  }

  async fetchTasks(
    token: string,
    listId: string,
    pageSize = 100
  ): Promise<{ listId: string; taskCount: number; sample: ClickUpTask[] }> {
    const client = new ClickUpApiClient(token);
    const tasks = await client.listTasks(listId, pageSize);
    return {
      listId,
      taskCount: tasks.length,
      sample: tasks.slice(0, 5),
    };
  }
}
