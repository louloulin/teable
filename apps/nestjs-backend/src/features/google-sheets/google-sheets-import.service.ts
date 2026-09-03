/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Google Sheets import service (Phase 4.3).
 *
 * Bridges `GoogleSheetsOAuthService` (token storage + refresh) and
 * `googleSheetsValuesGet` (REST) with `RecordOpenApiV2Service.createRecords`
 * so the unified source-import driver can actually migrate a sheet.
 *
 * Pull model:
 *   - token: `GoogleSheetsOAuthService.getValidAccessToken(spaceId)`
 *   - fetch: `googleSheetsValuesGet({ spreadsheetId, range: 'A1:Z1000', accessToken })`
 *   - map:   first row = header → `{ header: fieldName }`; subsequent rows → `IRecord`
 *   - write: `RecordOpenApiV2Service.createRecords(tableId, { records, fieldKeyType: 'name' })`
 *
 * The driver wraps this service with the cancel + progress hooks. The
 * service itself is cancel-agnostic and transport-agnostic so it can
 * also be called from a one-off CLI / migration script.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger } from '@nestjs/common';

import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';
import {
  GoogleSheetsApiError,
  googleSheetsValuesGet,
  type IGoogleSheetsValuesGetResponse,
} from './google-sheets-api.client';

export interface IGoogleSheetsImportInput {
  spaceId: string;
  tableId: string;
  spreadsheetId: string;
  /**
   * A1 notation range; defaults to `A1:Z1000` (first 1000 rows × 26
   * columns). Cloud allows the user to override this from the UI; in
   * OSS we keep the default so the driver always has a deterministic
   * first cut.
   */
  range?: string;
  /** Cell-coerce function for header parsing; defaults to identity. */
  normalizeHeader?: (raw: string) => string;
  /** Optional progress hook. */
  onProgress?: (state: { imported: number; skipped: number; total: number }) => void | Promise<void>;
  /** Optional cancel predicate. */
  isCanceled?: () => boolean;
}

export interface IGoogleSheetsImportResult {
  imported: number;
  skipped: number;
  total: number;
  range: string;
}

const DEFAULT_RANGE = 'A1:Z1000';
const MAX_BATCH_SIZE = 100;

@Injectable()
export class GoogleSheetsImportService {
  private readonly logger = new Logger(GoogleSheetsImportService.name);

  constructor(
    private readonly oauth: GoogleSheetsOAuthService,
    private readonly records: RecordOpenApiV2Service
  ) {}

  /**
   * Executes the full migration. Caller is expected to have already
   * validated the connection (see `GoogleSheetsSourceDriver`).
   */
  async importSheet(input: IGoogleSheetsImportInput): Promise<IGoogleSheetsImportResult> {
    if (!input.spaceId) throw new Error('spaceId is required');
    if (!input.tableId) throw new Error('tableId is required');
    if (!input.spreadsheetId) throw new Error('spreadsheetId is required');

    const token = await this.oauth.getValidAccessToken(input.spaceId);
    if (!token) {
      throw new Error(`no Google Sheets token stored for space ${input.spaceId}`);
    }

    const range = input.range ?? DEFAULT_RANGE;
    const response = await this.fetchValues({
      spreadsheetId: input.spreadsheetId,
      range,
      accessToken: token.accessToken,
    });

    const values = response.values ?? [];
    const headerRow = values.shift() ?? [];
    const headers = headerRow.map((raw, idx) => {
      const normalize = input.normalizeHeader ?? ((s: string) => s.trim());
      const fallback = `column_${idx + 1}`;
      return normalize(String(raw ?? '')) || fallback;
    });
    const total = values.length;
    let imported = 0;
    let skipped = 0;

    if (values.length === 0) {
      this.logger.log(
        `google sheets import: no data rows (spreadsheet=${input.spreadsheetId} range=${range})`
      );
      return { imported: 0, skipped: 0, total: 0, range };
    }

    // Process in batches of MAX_BATCH_SIZE so a 1000-row sheet doesn't
    // turn into a single 1000-element createRecords call.
    for (let start = 0; start < values.length; start += MAX_BATCH_SIZE) {
      if (input.isCanceled?.()) {
        this.logger.log(`google sheets import canceled at row ${start}`);
        break;
      }
      const slice = values.slice(start, start + MAX_BATCH_SIZE);
      const records = slice
        .map((row, rowOffset) => this.mapRowToRecord(row, headers, start + rowOffset))
        .filter((record): record is { fields: Record<string, unknown> } => {
          if (record === null) {
            skipped += 1;
            return false;
          }
          return true;
        });

      if (records.length > 0) {
        await this.records.createRecords(input.tableId, {
          records,
          fieldKeyType: FieldKeyType.Name,
        });
        imported += records.length;
      }
      await input.onProgress?.({ imported, skipped, total });
    }

    this.logger.log(
      `google sheets import done: imported=${imported} skipped=${skipped} total=${total} ` +
        `spreadsheet=${input.spreadsheetId}`
    );
    return { imported, skipped, total, range };
  }

  private async fetchValues(input: {
    spreadsheetId: string;
    range: string;
    accessToken: string;
  }): Promise<IGoogleSheetsValuesGetResponse> {
    try {
      return await googleSheetsValuesGet(input);
    } catch (err) {
      if (err instanceof GoogleSheetsApiError) {
        // Surface a domain-level error so the import driver can mark
        // the durable-task row with the Sheets code and decide retry.
        throw new Error(`google sheets api ${err.code}: ${err.message} (retryable=${err.retryable})`);
      }
      throw err;
    }
  }

  private mapRowToRecord(
    row: string[],
    headers: string[],
    rowIndex: number
  ): { fields: Record<string, unknown> } | null {
    if (!row.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
      // Empty / whitespace-only row — skip.
      return null;
    }
    const fields: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const raw = row[i] ?? '';
      // Leave the value as a string for now; record-open-api applies
      // the field's own coercion. Cloud swaps in a typed mapper if it
      // wants to round-trip numbers / booleans explicitly.
      fields[headers[i]!] = raw;
    }
    // Tag the row index so duplicates from re-runs are traceable.
    fields['_source_row'] = rowIndex + 2; // +2 = 1-based + header
    return { fields };
  }
}
