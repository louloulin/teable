import { Injectable, Logger } from '@nestjs/common';
import { NocoDbApiClient } from './nocodb-api.client';
import type {
  NocoDbBase,
  NocoDbConnectionProbe,
  NocoDbRow,
  NocoDbTable,
} from './nocodb-import.types';

/**
 * Round-20: NocoDB migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) pattern. NocoDB is REST-based
 * with two API versions (v1 metadata, v2 rows) and xc-token auth.
 *
 * Provides:
 *   1. Credential probe — list bases + sample table count
 *   2. List bases
 *   3. List tables within a base
 *   4. Fetch rows (paginated) from a table
 */
@Injectable()
export class NocoDbImportService {
  private readonly logger = new Logger(NocoDbImportService.name);

  probe(baseUrl: string, token: string): Promise<NocoDbConnectionProbe> {
    const client = new NocoDbApiClient(baseUrl, token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listBases(baseUrl: string, token: string): Promise<NocoDbBase[]> {
    return new NocoDbApiClient(baseUrl, token).listBases();
  }

  async listTables(
    baseUrl: string,
    token: string,
    baseId: string
  ): Promise<NocoDbTable[]> {
    return new NocoDbApiClient(baseUrl, token).listTables(baseId);
  }

  async fetchRows(
    baseUrl: string,
    token: string,
    tableId: string,
    pageSize = 100
  ): Promise<{ tableId: string; rowCount: number; sample: NocoDbRow[] }> {
    const rows = await new NocoDbApiClient(baseUrl, token).listRows(tableId, pageSize);
    return {
      tableId,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }
}
