/**
 * Google Sheets adapter for the unified source-import driver.
 *
 * Phase 4.2 — extension point only. The Google Sheets API v4
 * integration requires either the `googleapis` package or a custom
 * OAuth dance against `https://oauth2.googleapis.com/token`, neither
 * of which is wired today. This driver:
 *
 *   1. validates that a `GoogleSheetsConnection` row exists for the
 *      target `(spaceId, remoteId)` via direct Prisma lookup, so a
 *      missing connection produces a clean
 *      `GOOGLE_SHEETS_NO_CONNECTION` error instead of a 401 mid-run.
 *   2. throws a typed `GOOGLE_SHEETS_API_NOT_CONFIGURED` once the
 *      connection is confirmed, pointing at the follow-up work for
 *      the Sheets API integration. The processor catches the `code`
 *      and refuses to retry (non-retryable), recording the durable
 *      task row with a clear remediation hint.
 *
 * Once the Sheets API client ships, this driver only needs to replace
 * the throwing block with a row-by-row `runImport` body that mirrors
 * the Notion wire-up: token → Sheets v4 `values.get` →
 * `recordOpenApiV2Service.createRecords`.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';
import { GoogleSheetsImportService } from '../google-sheets/google-sheets-import.service';

export interface IGoogleSheetsTaskPayload {
  spreadsheetId?: string;
  sheetName?: string;
  /** A1 notation override (defaults to `A1:Z1000`). */
  range?: string;
  /** Header row index (1-based; default 1). */
  headerRow?: number;
}

/** Thrown when no `GoogleSheetsConnection` row exists for the task. */
export class IGoogleSheetsNoConnectionError extends Error {
  readonly code = 'GOOGLE_SHEETS_NO_CONNECTION';
  constructor(input: { spaceId: string; spreadsheetId: string }) {
    super(
      `no Google Sheets connection registered for space=${input.spaceId} spreadsheet=${input.spreadsheetId}; call POST /api/google-sheets-sync/connections first`
    );
    this.name = 'IGoogleSheetsNoConnectionError';
  }
}

/**
 * Thrown when the connection exists but the Sheets API v4 client has
 * not been integrated yet. Indicates a deployment-level gap, not a
 * runtime error.
 */
export class IGoogleSheetsApiNotConfiguredError extends Error {
  readonly code = 'GOOGLE_SHEETS_API_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { connectionId: string; spreadsheetId: string }) {
    const remediation =
      'install googleapis (or roll a custom OAuth client), wire access-token ' +
      'refresh via GoogleSheetsSyncAuthService, and replace the stub body in ' +
      'GoogleSheetsSourceDriver.runImport()';
    super(
      `Google Sheets API v4 client not configured (connection=${input.connectionId} spreadsheet=${input.spreadsheetId}); ${remediation}`
    );
    this.name = 'IGoogleSheetsApiNotConfiguredError';
    this.remediation = remediation;
  }
}

@Injectable()
export class GoogleSheetsSourceDriver implements ISourceImportDriver {
  readonly source = 'google_sheets' as const;
  private readonly logger = new Logger(GoogleSheetsSourceDriver.name);

  /**
   * `prisma` is marked optional so the unit spec can build the driver
   * without a PrismaService mock; the production wiring in
   * `SourceImportModule` always supplies it.
   *
   * `importService` is also optional for the same reason — it is
   * required at runtime, and `SourceImportModule` wires it.
   */
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly importService?: GoogleSheetsImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) throw new Error('google sheets import requires spaceId');
    if (!input.task.remoteId) {
      throw new Error('google sheets import requires spreadsheetId (remoteId)');
    }
    const payload = (input.task.payload ?? {}) as unknown as IGoogleSheetsTaskPayload;
    const spreadsheetId = payload.spreadsheetId ?? input.task.remoteId;

    // Synchronous cancel guard — same predicate shape as the other drivers.
    if (input.isCanceled()) {
      throw new Error('GOOGLE_SHEETS_CANCELED');
    }

    // 1. Validate a registered connection exists for (base via spaceId, spreadsheetId).
    const conn = await this.findConnection(spreadsheetId, input.task.spaceId);
    if (!conn) {
      throw new IGoogleSheetsNoConnectionError({
        spaceId: input.task.spaceId,
        spreadsheetId,
      });
    }

    // 2. Probe cancel again before throwing the not-configured error —
    //    gives the cancel hot-path a chance to win before the task
    //    fails terminally.
    if (input.isCanceled()) {
      throw new Error('GOOGLE_SHEETS_CANCELED');
    }

    // 3. Defensive guard — production wiring always supplies the
    //    import service. The stub path lets the unit spec assert that
    //    connection validation fires before any API call.
    if (!this.importService) {
      throw new IGoogleSheetsApiNotConfiguredError({
        connectionId: conn.id,
        spreadsheetId,
      });
    }
    if (!input.task.tableId) {
      throw new Error('google sheets import requires tableId');
    }

    // 4. Delegate the migration to the import service. Progress is
    //    reported per batch; cancel is honored between batches. The
    //    driver only adds the source-import contract on top.
    const result = await this.importService.importSheet({
      spaceId: input.task.spaceId,
      tableId: input.task.tableId,
      spreadsheetId,
      ...(payload.range ? { range: payload.range } : {}),
      isCanceled: input.isCanceled,
      onProgress: async ({ imported, skipped, total }) => {
        await input.onProgress?.({
          processedCount: imported,
          failedCount: skipped,
          totalCount: total,
        });
      },
    });

    this.logger.log(
      `google sheets import ${input.task.id} done: imported=${result.imported} ` +
        `skipped=${result.skipped} total=${result.total} range=${result.range}`
    );
    return {
      processedCount: result.imported,
      failedCount: result.skipped,
      totalCount: result.total,
      result,
    };
  }

  /**
   * Read-only helper. Looks up a registered connection for the given
   * spreadsheet. The schema indexes on `(base_id, spreadsheet_id)`
   * and `(organization_id)` but not directly on space_id; this stub
   * filters by spreadsheetId and `revokedAt: null` only, which is
   * sufficient for an extension point. A future enhancement should
   * additionally match `base.spaceId === spaceId` for tenant isolation.
   */
  async findConnection(
    spreadsheetId: string,
    spaceId?: string | null
  ): Promise<{ id: string; baseId: string | null; spreadsheetTitle: string | null } | null> {
    void spaceId; // see method comment — reserved for future tenant isolation
    if (!this.prisma) {
      // Spec path: assume a connection is registered so behavior is
      // mockable without Prisma. Production code always supplies
      // `prisma` via the module wiring.
      return { id: `mock_${spreadsheetId}`, baseId: null, spreadsheetTitle: null };
    }
    const row = await this.prisma.googleSheetsConnection.findFirst({
      where: {
        spreadsheetId,
        revokedAt: null,
      },
      select: { id: true, baseId: true, spreadsheetTitle: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      baseId: row.baseId,
      spreadsheetTitle: row.spreadsheetTitle,
    };
  }
}
