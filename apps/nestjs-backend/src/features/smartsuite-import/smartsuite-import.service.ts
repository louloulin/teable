import { Injectable, Logger } from '@nestjs/common';
import { SmartSuiteApiClient } from './smartsuite-api.client';
import type {
  SmartSuiteApp,
  SmartSuiteConnectionProbe,
  SmartSuiteRecord,
  SmartSuiteTable,
} from './smartsuite-import.types';

/**
 * Round-22: SmartSuite migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) + nocodb (R20) + smartsheet (R21)
 * pattern.
 *
 * Provides:
 *   1. Credential probe — verify access token + app/table counts
 *   2. List apps (workspace-equivalent in SmartSuite hierarchy)
 *   3. List tables inside an app
 *   4. Fetch records (paginated via offset) from an app
 *
 * SmartSuite-specific fields (status, date, duedate, etc.) are kept as opaque
 * blobs in this round; downstream translator handles them.
 */
@Injectable()
export class SmartSuiteImportService {
  private readonly logger = new Logger(SmartSuiteImportService.name);

  probe(token: string): Promise<SmartSuiteConnectionProbe> {
    const client = new SmartSuiteApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listApps(token: string): Promise<{ count: number; apps: SmartSuiteApp[] }> {
    const apps = await new SmartSuiteApiClient(token).listApps();
    return { count: apps.length, apps: apps.slice(0, 50) };
  }

  async listTables(token: string, appId: string): Promise<SmartSuiteTable[]> {
    return new SmartSuiteApiClient(token).listTables(appId);
  }

  async fetchRecords(
    token: string,
    appId: string,
    limit = 100
  ): Promise<{ appId: string; recordCount: number; sample: SmartSuiteRecord[] }> {
    const records = await new SmartSuiteApiClient(token).fetchRecords(appId, limit);
    return {
      appId,
      recordCount: records.length,
      sample: records.slice(0, 5),
    };
  }
}
