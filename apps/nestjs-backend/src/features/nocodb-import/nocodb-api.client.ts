import { Injectable, Logger } from '@nestjs/common';
import type {
  NocoDbBase,
  NocoDbConnectionProbe,
  NocoDbRow,
  NocoDbTable,
} from './nocodb-import.types';

/**
 * Round-20: Minimal NocoDB REST API client. Provides:
 *   - probe() — list first few bases
 *   - listBases() — /api/v1/db/meta/projects
 *   - listTables() — /api/v1/db/meta/projects/{baseId}/tables
 *   - listRows() — /api/v2/tables/{tableId}/records
 *
 * Auth: xc-token header (NocoDB API token).
 * Two API versions: v1 for metadata, v2 for rows.
 */
@Injectable()
export class NocoDbApiClient {
  private readonly logger = new Logger(NocoDbApiClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        'xc-token': this.token,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `NocoDB API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listBases(): Promise<NocoDbBase[]> {
    const data = await this.fetchJson<{ list: NocoDbBase[] }>(
      '/api/v1/db/meta/projects'
    );
    return data.list ?? [];
  }

  async listTables(baseId: string): Promise<NocoDbTable[]> {
    const data = await this.fetchJson<{ list: NocoDbTable[] }>(
      `/api/v1/db/meta/projects/${baseId}/tables`
    );
    return data.list ?? [];
  }

  async listRows(tableId: string, pageSize = 100): Promise<NocoDbRow[]> {
    const data = await this.fetchJson<{ list: NocoDbRow[]; pageInfo?: unknown }>(
      `/api/v2/tables/${tableId}/records?limit=${pageSize}`
    );
    return data.list ?? [];
  }

  async probe(): Promise<{
    ok: boolean;
    baseCount?: number;
    tableCount?: number;
    error?: string;
  }> {
    try {
      const bases = await this.listBases();
      let tableCount = 0;
      for (const base of bases.slice(0, 3)) {
        const tables = await this.listTables(base.id);
        tableCount += tables.length;
      }
      return { ok: true, baseCount: bases.length, tableCount };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`nocodb probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
