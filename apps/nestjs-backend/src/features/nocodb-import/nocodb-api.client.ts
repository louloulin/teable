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
 * Round-36: listRows now accepts an `offset` parameter so the
 * `listAllRows` paginator can stream all rows for the
 * record-creation path.
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

  /**
   * List rows from a table.
   *
   * @param tableId  NocoDB table slug or id (NocoDB v2 accepts both)
   * @param limit    Page size — capped server-side; we default to 100
   * @param offset   Optional offset (Round-36). NocoDB v2 supports
   *                 `offset` for sequential paging. `undefined` (or 0)
   *                 means "from the start" and matches the original
   *                 Round-20 call.
   */
  async listRows(tableId: string, limit = 100, offset = 0): Promise<NocoDbRow[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (offset > 0) params.set('offset', String(offset));
    const data = await this.fetchJson<{ list: NocoDbRow[]; pageInfo?: unknown }>(
      `/api/v2/tables/${tableId}/records?${params.toString()}`
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
