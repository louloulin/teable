import { Injectable, Logger } from '@nestjs/common';
import { SmartsheetApiClient } from './smartsheet-api.client';
import type {
  SmartsheetConnectionProbe,
  SmartsheetRow,
  SmartsheetSheet,
} from './smartsheet-import.types';

/**
 * Round-21: Smartsheet migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) + nocodb (R20) pattern.
 *
 * Provides:
 *   1. Credential probe — verify access token + sheet count
 *   2. List sheets
 *   3. Fetch rows (paginated) from a sheet
 *
 * Smartsheet-specific columns (system, picklist, contact-list, etc.) are
 * kept as opaque blobs in this round; downstream translator handles them.
 */
@Injectable()
export class SmartsheetImportService {
  private readonly logger = new Logger(SmartsheetImportService.name);

  probe(token: string): Promise<SmartsheetConnectionProbe> {
    const client = new SmartsheetApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listSheets(token: string, pageSize = 100): Promise<SmartsheetSheet[]> {
    return new SmartsheetApiClient(token).listSheets(pageSize);
  }

  async fetchRows(
    token: string,
    sheetId: number,
    pageSize = 100
  ): Promise<{ sheetId: number; rowCount: number; sample: SmartsheetRow[] }> {
    const rows = await new SmartsheetApiClient(token).listRows(sheetId, pageSize);
    return {
      sheetId,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }
}
