/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Baserow adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 21 — extension point (stub → typed BASEROW_NOT_CONFIGURED).
 * Round 37 — real wiring (probe + importTable → record creation).
 *   Mirrors the NocoDB Round-36 driver shape:
 *     1. validates task identifiers (spaceId / remoteId / tableId);
 *     2. cancels up-front (synchronous predicate);
 *     3. probes credentials via `importService.probe`;
 *     4. delegates the paginated fetch + batched createRecords loop
 *        to `importService.importTable` with `mapRowToFields` from
 *        the driver.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BaserowImportService,
  IBaserowImportCanceledError,
} from '../baserow-import/baserow-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface IBaserowTaskPayload {
  /** Baserow database id (the workspace-scoped database that owns the table). */
  databaseId?: string;
  /** Baserow table id to read from. Falls back to `task.remoteId` when absent. */
  tableId?: string;
  /** Optional Baserow view id (filters rows + respects ordering). */
  viewId?: string;
  /** API token. Read from the connection row once registered. */
  apiToken?: string;
  /** Baserow base URL, e.g. `https://api.baserow.io`. Required by the real driver. */
  baseUrl?: string;
  /** Page size override (default 100, Baserow max 200). */
  size?: number;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
}

/**
 * Thrown when the task payload is missing required Baserow identifiers.
 * Non-retryable — the operator must fix the task and re-queue.
 */
export class BaserowInvalidPayloadError extends Error {
  readonly code = 'BASEROW_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `baserow import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'BaserowInvalidPayloadError';
  }
}

/**
 * Thrown when the payload is valid but the Baserow REST API client has
 * not been integrated yet. Indicates a deployment-level gap, not a
 * runtime error.
 */
export class BaserowNotConfiguredError extends Error {
  readonly code = 'BASEROW_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { tableId: string }) {
    const remediation =
      'add BaserowImportService (mirroring GoogleSheetsImportService): token ' +
      'auth against /api/database/rows/table/<tableId>/?user_field_names=true, ' +
      'cursor-based pagination via `next` URL, field-type mapping (single_text, ' +
      'long_text, number, boolean, single_select, multiple_select, link_row, ' +
      'date, file, etc.), then write through recordOpenApiV2Service.createRecords. ' +
      'Replace the stub body in BaserowSourceDriver.runImport().';
    super(
      `Baserow REST API client not configured (table=${input.tableId}); ${remediation}`
    );
    this.name = 'BaserowNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * Baserow row keys that come back from the REST API but should never
 * be written to a Teable cell. `id` is the platform primary key;
 * `order` is the row's sort weight (decimal string).
 */
const BASEROW_SYSTEM_KEYS: ReadonlySet<string> = new Set([
  'id',
  'order',
]);

/**
 * Map a Baserow row into a Teable `fields` object. Drops Baserow
 * system keys; preserves everything else.
 */
export function baserowRowToFields(row: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (BASEROW_SYSTEM_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    fields[key] = value;
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class BaserowSourceDriver implements ISourceImportDriver {
  readonly source = 'baserow' as const;
  private readonly logger = new Logger(BaserowSourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: BaserowImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new BaserowInvalidPayloadError(['spaceId']);
    }
    if (!input.task.remoteId) {
      throw new BaserowInvalidPayloadError(['remoteId']);
    }
    // Round 37 — record creation requires a destination table on the
    // durable task.
    if (!input.task.tableId) {
      throw new BaserowInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IBaserowTaskPayload;
    const tableIdRaw = payload.tableId ?? input.task.remoteId;
    if (!tableIdRaw) {
      throw new BaserowInvalidPayloadError(['tableId']);
    }
    // Baserow uses numeric table ids.
    const tableId = Number(tableIdRaw);
    if (!Number.isFinite(tableId)) {
      throw new BaserowInvalidPayloadError(['tableId (not numeric)']);
    }

    // Synchronous cancel guard — same predicate shape as the Sheets / NocoDB driver.
    if (input.isCanceled()) {
      throw new IBaserowImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `baserow import ${input.task.id} requested but BaserowImportService ` +
          `not yet wired (table=${tableId})`
      );
      throw new BaserowNotConfiguredError({ tableId: String(tableId) });
    }

    if (!payload.baseUrl || !payload.apiToken) {
      const missingCreds: string[] = [];
      if (!payload.baseUrl) missingCreds.push('baseUrl');
      if (!payload.apiToken) missingCreds.push('apiToken');
      throw new BaserowInvalidPayloadError(missingCreds);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row
    // rather than a confusing fetch failure mid-batch.
    const probe = await this.importService.probe(payload.baseUrl, payload.apiToken, tableId);
    if (!probe.ok) {
      throw new Error(`baserow probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `baserow import ${input.task.id} probe: ok workspace=${probe.workspaceName ?? 'unknown'} ` +
        `tableCount=${probe.tableCount ?? 0} (table=${tableId})`
    );

    // Cancel guard between probe and record creation — the probe is a
    // network call, so we check again before the write loop.
    if (input.isCanceled()) {
      throw new IBaserowImportCanceledError();
    }

    // Round 37 — delegate the full paginated fetch + batched
    // record-creation loop to `BaserowImportService.importTable`. The
    // service owns cancel propagation, batch chunking, and the
    // `recordOpenApiV2Service.createRecords` write. The driver stays
    // a thin mapper + entry-point.
    const pageSize = payload.size ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      baseUrl: payload.baseUrl,
      apiToken: payload.apiToken,
      tableId,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapRowToFields: baserowRowToFields,
    });

    this.logger.log(
      `baserow import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(table=${tableId})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        tableId,
        destinationTableId: input.task.tableId,
        workspaceName: probe.workspaceName,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        baseUrl: payload.baseUrl,
        pageSize,
        batchSize,
      },
    };
  }
}
