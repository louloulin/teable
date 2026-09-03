import { Injectable, Logger } from '@nestjs/common';
import type {
  SmartSuiteApp,
  SmartSuiteRecord,
  SmartSuiteTable,
} from './smartsuite-import.types';

/**
 * Round-22: Minimal SmartSuite REST API client. Provides:
 *   - probe() — verify token via /applications + count tables
 *   - listApps() — /applications/
 *   - listTables() — /applications/{id}/  (tables are nested under the app)
 *   - fetchRecords() — /applications/{id}/records/list/ (POST)
 *
 * Round-41: adds `fetchRecords(appId, limit, offset)` so the
 * record-creation path can paginate via the `offset` request
 * parameter and the `offset` field on the response (SmartSuite's
 * next-cursor convention).
 *
 * Auth: Authorization header with `Bearer <apiKey>`.
 * Endpoint: https://api.smartsuite.com/api/v1/
 */
@Injectable()
export class SmartSuiteApiClient {
  private readonly logger = new Logger(SmartSuiteApiClient.name);
  private readonly endpoint = 'https://api.smartsuite.com/api/v1';

  constructor(private readonly token: string) {}

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `SmartSuite API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listApps(): Promise<SmartSuiteApp[]> {
    const data = await this.fetchJson<{ items?: SmartSuiteApp[]; data?: SmartSuiteApp[] }>(
      '/applications/'
    );
    return data.items ?? data.data ?? [];
  }

  async listTables(appId: string): Promise<SmartSuiteTable[]> {
    const data = await this.fetchJson<SmartSuiteApp & { tables?: SmartSuiteTable[] }>(
      `/applications/${encodeURIComponent(appId)}/`
    );
    return data.tables ?? data.structure ?? [];
  }

  /**
   * Fetch a single page of records. Returns both the page and the
   * next offset (Round-41). `null` next-offset means no more pages.
   */
  async fetchRecords(
    appId: string,
    limit = 100,
    offset = 0
  ): Promise<{ items: SmartSuiteRecord[]; nextOffset: number | null }> {
    const body = JSON.stringify({
      filters: { operator: 'and', fields: [] },
      limit,
      offset,
    });
    const data = await this.fetchJson<{
      items?: SmartSuiteRecord[];
      records?: SmartSuiteRecord[];
      offset?: number | null;
    }>(
      `/applications/${encodeURIComponent(appId)}/records/list/`,
      { method: 'POST', body }
    );
    return {
      items: data.items ?? data.records ?? [],
      nextOffset: data.offset ?? null,
    };
  }

  async probe(): Promise<{
    ok: boolean;
    appCount?: number;
    tableCount?: number;
    user?: { id: string; email: string };
    error?: string;
  }> {
    try {
      const apps = await this.listApps();
      let tableCount = 0;
      for (const app of apps.slice(0, 5)) {
        try {
          const tables = await this.listTables(app.id);
          tableCount += tables.length;
        } catch {
          // ignore individual app failures during probe
        }
      }
      return {
        ok: true,
        appCount: apps.length,
        tableCount,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`smartsuite probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
