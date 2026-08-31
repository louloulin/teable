import { Injectable, Logger } from '@nestjs/common';
import type {
  BaserowField,
  BaserowRow,
  BaserowTableSchema,
} from './baserow-import.types';

/**
 * Round-16: Minimal Baserow REST API client. Only the calls needed to
 * (1) verify credentials, (2) list tables, (3) fetch rows.
 *
 * Baserow API base URL is https://api.baserow.io (hosted) or the
 * self-hosted URL (e.g. https://baserow.example.com). The user provides
 * the base URL along with the token.
 */
@Injectable()
export class BaserowApiClient {
  private readonly logger = new Logger(BaserowApiClient.name);

  constructor(private readonly baseUrl: string, private readonly token: string) {
    // strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Token ${this.token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Baserow API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listFields(tableId: number): Promise<BaserowField[]> {
    return this.fetchJson<BaserowField[]>(
      `/api/database/fields/table/${tableId}/`
    );
  }

  async listRows(tableId: number, pageSize = 100): Promise<BaserowRow[]> {
    return this.fetchJson<BaserowRow[]>(
      `/api/database/rows/table/${tableId}/?size=${pageSize}`
    );
  }

  async probe(): Promise<{
    ok: boolean;
    workspaceName?: string;
    tableCount?: number;
    error?: string;
  }> {
    try {
      // GET /api/workspaces/ returns the list of workspaces the token can access.
      const workspaces = await this.fetchJson<Array<{ id: number; name: string }>>(
        '/api/workspaces/'
      );
      const ws = workspaces[0];
      if (!ws) return { ok: false, error: 'no workspace accessible with this token' };

      // Count tables across all databases in the workspace
      const databases = await this.fetchJson<Array<{ id: number; name: string }>>(
        `/api/databases/?workspace_id=${ws.id}`
      );
      let tableCount = 0;
      for (const db of databases.slice(0, 5)) {
        const tables = await this.fetchJson<BaserowTableSchema[]>(
          `/api/database/tables/database/${db.id}/`
        );
        tableCount += tables.length;
      }
      return { ok: true, workspaceName: ws.name, tableCount };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`baserow probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
