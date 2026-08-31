import { Injectable, Logger } from '@nestjs/common';
import type {
  SmartsheetConnectionProbe,
  SmartsheetRow,
  SmartsheetSheet,
} from './smartsheet-import.types';

/**
 * Round-21: Minimal Smartsheet REST API client. Provides:
 *   - probe() — verify token via /users/me + count sheets
 *   - listSheets() — /sheets
 *   - listRows() — /sheets/{id}/rows
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

  async listRows(sheetId: number, pageSize = 100): Promise<SmartsheetRow[]> {
    const data = await this.fetchJson<{ rows: SmartsheetRow[] }>(
      `/sheets/${sheetId}/rows?pageSize=${pageSize}`
    );
    return data.rows ?? [];
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
