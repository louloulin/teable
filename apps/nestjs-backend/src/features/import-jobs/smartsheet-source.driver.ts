/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Smartsheet adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 21 — extension point (stub → typed SMARTSHEET_NOT_CONFIGURED).
 * Round 42 — real wiring (probe + importTable → record creation).
 *   Mirrors the NocoDB Round-36 / Baserow Round-37 / Jira Round-38 /
 *   monday Round-39 / ClickUp Round-40 / SmartSuite Round-41 driver
 *   shape.
 *
 * Smartsheet data model:
 *   - **sheet** carries typed columns + rows
 *   - **row** carries `cells[]` where each cell has
 *     `columnId / value / displayValue / format`
 *   - **column** types include TEXT_NUMBER, CHECKBOX, DATE,
 *     DATETIME, CONTACT_LIST, PICKLIST, MULTI_PICKLIST, DURATION,
 *     ABSTRACT_DATETIME, …
 *
 * Pagination: numeric `page` parameter (1-indexed) + `pageSize`.
 * The server returns either `page: null` (explicit end) or
 * `rows.length < pageSize` (implicit end); the client uses both as
 * termination signals.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  SmartsheetImportService,
  ISmartsheetImportCanceledError,
} from '../smartsheet-import/smartsheet-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface ISmartsheetTaskPayload {
  /** Smartsheet sheet id. Falls back to `task.remoteId`. Required. */
  sheetId?: string;
  /** Page size override (default 500, Smartsheet max per-page). */
  pageSize?: number;
  /** Include cross-sheet references (default false — they require a second round trip). */
  includeCrossSheetRefs?: boolean;
  /** API access token (Bearer auth). Required by the real driver. */
  accessToken?: string;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
}

export class SmartsheetInvalidPayloadError extends Error {
  readonly code = 'SMARTSHEET_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `smartsheet import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'SmartsheetInvalidPayloadError';
  }
}

export class SmartsheetNotConfiguredError extends Error {
  readonly code = 'SMARTSHEET_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { sheetId: string }) {
    const remediation =
      'add SmartsheetImportService: Bearer auth against ' +
      'https://api.smartsheet.com/2.0/, resolve sheetId via ' +
      'GET /sheets/<sheetId>, stream rows via ' +
      'GET /sheets/<sheetId>/rows?page=<n>&pageSize=500 with numeric ' +
      'page-based pagination (response.page === null OR rows.length < ' +
      'pageSize indicates end), decode cells[] per columnType registry ' +
      '(TEXT_NUMBER, CHECKBOX, DATE, DATETIME, CONTACT_LIST, PICKLIST, ' +
      'MULTI_PICKLIST, DURATION, ABSTRACT_DATETIME, …), optional second ' +
      'pass for cross-sheet references and discussions, write through ' +
      'recordOpenApiV2Service.createRecords. Replace the stub body in ' +
      'SmartsheetSourceDriver.runImport().';
    super(
      `Smartsheet REST client not configured (sheet=${input.sheetId}); ${remediation}`
    );
    this.name = 'SmartsheetNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * Smartsheet row keys that come back from the REST API but should
 * never be written to a Teable cell directly. `id` is the platform
 * primary key — preserved. `sheetId` / `rowNumber` are surfaced as
 * scalar columns. `cells[]` is the typed cell payload — spread into
 * top-level keys keyed by `column_<columnId>` (columnId is the only
 * stable identifier exposed by Smartsheet; column names live in a
 * separate GET /sheets/<sheetId> call and may shift between sheets).
 */
const SMARTSHEET_ROW_DROP_KEYS: ReadonlySet<string> = new Set([
  'cells', // expanded into top-level cells (column_<id> keys)
]);

/**
 * Map a Smartsheet row into a Teable `fields` object. Surfaces
 * reference columns + flattens the `cells[]` envelope into
 * top-level keys keyed by `column_<columnId>` so that downstream
 * translators can resolve column names without an extra API round
 * trip per row.
 */
export function smartsheetRowToFields(
  row: Record<string, unknown>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const idKey of ['id', 'sheetId', 'rowNumber', 'createdAt', 'modifiedAt']) {
    const v = row[idKey];
    if (v !== null && v !== undefined && v !== '') fields[idKey] = v;
  }
  // Spread `row.cells[]` into `column_<columnId>` keys.
  const cells = row['cells'];
  if (Array.isArray(cells)) {
    for (const cell of cells) {
      if (!cell || typeof cell !== 'object') continue;
      const c = cell as Record<string, unknown>;
      const columnId = c['columnId'];
      if (columnId === null || columnId === undefined) continue;
      const value = c['value'];
      if (value === null || value === undefined) continue;
      const displayValue = c['displayValue'];
      const cellKey = `column_${String(columnId)}`;
      // Prefer displayValue (human-readable) when value is a typed
      // primitive that the API marks opaque; otherwise pass through.
      fields[cellKey] =
        displayValue !== undefined && displayValue !== null && displayValue !== ''
          ? displayValue
          : value;
    }
  }
  for (const dropKey of SMARTSHEET_ROW_DROP_KEYS) {
    delete fields[dropKey];
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class SmartsheetSourceDriver implements ISourceImportDriver {
  readonly source = 'smartsheet' as const;
  private readonly logger = new Logger(SmartsheetSourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: SmartsheetImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new SmartsheetInvalidPayloadError(['spaceId']);
    }
    if (!input.task.tableId) {
      throw new SmartsheetInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as ISmartsheetTaskPayload;
    const sheetId = payload.sheetId ?? input.task.remoteId;
    if (!sheetId) {
      throw new SmartsheetInvalidPayloadError(['sheetId']);
    }

    // Synchronous cancel guard (also covers the no-service fallback).
    if (input.isCanceled()) {
      throw new ISmartsheetImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `smartsheet import ${input.task.id} requested but SmartsheetImportService ` +
          `not yet wired (sheet=${sheetId})`
      );
      throw new SmartsheetNotConfiguredError({ sheetId });
    }

    if (!payload.accessToken) {
      throw new SmartsheetInvalidPayloadError(['accessToken']);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row.
    const probe = await this.importService.probe(payload.accessToken);
    if (!probe.ok) {
      throw new Error(`smartsheet probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `smartsheet import ${input.task.id} probe: ok sheetCount=${probe.sheetCount ?? 0} (sheet=${sheetId})`
    );

    // Cancel guard between probe and record creation.
    if (input.isCanceled()) {
      throw new ISmartsheetImportCanceledError();
    }

    // Round 42 — delegate the full paginated fetch + batched
    // record-creation loop to `SmartsheetImportService.importTable`.
    const numericSheetId = Number(sheetId);
    if (!Number.isFinite(numericSheetId)) {
      throw new SmartsheetInvalidPayloadError(['sheetId (numeric)']);
    }
    const pageSize = payload.pageSize ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      apiToken: payload.accessToken,
      sheetId: numericSheetId,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapRowToFields: smartsheetRowToFields,
    });

    this.logger.log(
      `smartsheet import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(sheet=${sheetId})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        sheetId,
        sheetCount: probe.sheetCount,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        pageSize,
        batchSize,
      },
    };
  }
}
