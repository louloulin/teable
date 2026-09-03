import { Injectable, Logger } from '@nestjs/common';
import type {
  SmartsheetConnectionProbe,
  SmartsheetRow,
  SmartsheetRowPage,
  SmartsheetSheet,
} from './smartsheet-import.types';

/**
 * Round-21: Minimal Smartsheet REST API client.
 * Round-42: pagination-aware `listRows(sheetId, pageSize, page)` returns
 *   `{ rows, nextPage }` where `nextPage` is the next numeric page to
 *   request (null when the current page is the last one — detected by
 *   `rows.length < pageSize` or explicit `page: null` in the response).
 *
 * Auth: Authorization header with Bearer access token.
 */
@Injectable()
export class SmartsheetApiClient {
  private readonly logger = new Logger(SmartsheetApiClient.name);
  private readonly endpoint = 'https://api.smartsheet.com/2.0';

  constructor(private readonly token: string) {}

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Smartsheet API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listSheets(pageSize = 100): Promise<SmartsheetSheet[]> {
    const data = await this.fetchJson<{ data: SmartsheetSheet[]; totalCount?: number }>(
      `/sheets?pageSize=${pageSize}`
    );
    return data.data ?? [];
  }

  /**
   * Fetch a single page of rows for a sheet. Smartsheet returns up to
   * `pageSize` rows per call; iteration increments `page` until the
   * response contains fewer than `pageSize` rows (terminal page).
   *
   * Termination rules (in order):
   *   1. `data.page === null` — server explicitly says no more pages
   *   2. `rows.length < pageSize` — short page, end of data
   *   3. else — server hinted a next-page number via `data.page`
   *   4. fallback — increment locally
   */
  async listRows(
    sheetId: number,
    pageSize = 500,
    page = 1
  ): Promise<SmartsheetRowPage> {
    const data = await this.fetchJson<{
      rows?: SmartsheetRow[];
      page?: number | null;
      totalRowCount?: number;
    }>(`/sheets/${sheetId}/rows?pageSize=${pageSize}&page=${page}`);
    const rows = data.rows ?? [];
    let nextPage: number | null;
    if (data.page === null) {
      nextPage = null;
    } else if (typeof data.page === 'number' && data.page > page) {
      nextPage = data.page;
    } else if (rows.length < pageSize) {
      nextPage = null;
    } else {
      nextPage = page + 1;
    }
    return { rows, nextPage };
  }

  async probe(): Promise<{
    ok: boolean;
    sheetCount?: number;
    user?: { id: number; email: string };
    error?: string;
  }> {
    try {
      const user = await this.fetchJson<{ id: number; email: string }>('/users/me');
      const sheets = await this.listSheets(100);
      return {
        ok: true,
        sheetCount: sheets.length,
        user: { id: user.id, email: user.email },
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`smartsheet probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
