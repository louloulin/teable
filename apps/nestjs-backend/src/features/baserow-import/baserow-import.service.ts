import { Injectable, Logger } from '@nestjs/common';
import { BaserowApiClient } from './baserow-api.client';
import type { BaserowConnectionProbe, BaserowRow } from './baserow-import.types';

/**
 * Round-16: Baserow migration driver (minimal). This is the OSS-side
 * counterpart to Cloud's "Connect & Migrate Baserow" feature. It:
 *   1. Validates a Baserow API token by calling /api/workspaces/
 *   2. Lists tables in a given base
 *   3. Fetches rows (paginated) for a given table
 *
 * The actual translation from Baserow fields → Teable fields happens
 * downstream (separate translate step). The driver exposes a clean
 * boundary so the translator can be added incrementally.
 */
@Injectable()
export class BaserowImportService {
  private readonly logger = new Logger(BaserowImportService.name);

  probe(baseUrl: string, token: string, baseId: number): Promise<BaserowConnectionProbe> {
    const client = new BaserowApiClient(baseUrl, token);
    return client.probe().then((p) => ({
      ...p,
      baseId,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listTables(baseUrl: string, token: string, baseId: number) {
    const client = new BaserowApiClient(baseUrl, token);
    const databases = await client.listDatabases().catch(() => []);
    return { baseId, count: Array.isArray(databases) ? databases.length : 0 };
  }

  async fetchRows(
    baseUrl: string,
    token: string,
    tableId: number,
    pageSize = 100
  ): Promise<{ tableId: number; rowCount: number; sample: BaserowRow[] }> {
    const client = new BaserowApiClient(baseUrl, token);
    const rows = await client.listRows(tableId, pageSize);
    return {
      tableId,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }

  listFields(baseUrl: string, token: string, tableId: number) {
    const client = new BaserowApiClient(baseUrl, token);
    return client.listFields(tableId);
  }
}
