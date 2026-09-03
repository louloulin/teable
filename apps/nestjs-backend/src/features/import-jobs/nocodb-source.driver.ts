/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * NocoDB adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 35 — stub → real wiring (probe + fetchRows).
 * Round 36 — full record-creation path: validate → probe → fetch all
 *   rows → delegate to `NocoDbImportService.importTable` which
 *   batch-writes through `recordOpenApiV2Service.createRecords`.
 *
 * Mirrors the Notion / Airtable driver shape. NocoDB stores rows as a
 * flat key/value map keyed by column title, so the mapper just drops
 * NocoDB's `Id` / system fields (`nc_*`) and trusts Teable's
 * `typecast: true` to coerce the rest.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  NocoDbImportService,
  INocoDbImportCanceledError,
} from '../nocodb-import/nocodb-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface INocoDbTaskPayload {
  /** NocoDB base (project) id; falls back to `task.remoteId` when absent. */
  baseId?: string;
  /** NocoDB table name to read from. Required. */
  tableName?: string;
  /** NocoDB API token. Required by the real driver. */
  apiToken?: string;
  /** NocoDB base URL, e.g. `https://nocodb.example.com`. Required by the real driver. */
  baseUrl?: string;
  /** Optional page size override (default 100). */
  limit?: number;
  /** Batch size for createRecords calls. Defaults to 100; capped to
   *  1000 to keep individual Teable write transactions bounded. */
  batchSize?: number;
}

/**
 * Thrown when the task payload is missing required NocoDB identifiers.
 * Non-retryable — the operator must fix the task and re-queue.
 */
export class NocoDbInvalidPayloadError extends Error {
  readonly code = 'NOCODB_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `nocodb import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'NocoDbInvalidPayloadError';
  }
}

/**
 * Thrown when the payload is valid but the NocoDB REST API client has
 * not been integrated yet. Indicates a deployment-level gap, not a
 * runtime error.
 */
export class NocoDbNotConfiguredError extends Error {
  readonly code = 'NOCODB_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { baseId: string; tableName: string }) {
    const remediation =
      'add NocoDbImportService (mirroring GoogleSheetsImportService): bearer ' +
      'auth against /api/v1/db/data/<baseId>/<tableName>, paginated fetch with ' +
      'limit/offset, header inference, then write through ' +
      'recordOpenApiV2Service.createRecords. Replace the stub body in ' +
      'NocoDbSourceDriver.runImport().';
    super(
      `NocoDB REST API client not configured (base=${input.baseId} ` +
        `table=${input.tableName}); ${remediation}`
    );
    this.name = 'NocoDbNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * NocoDB row keys that come back from the REST API but should never
 * be written to a Teable cell. These are bookkeeping fields the
 * platform adds (`nc_*` is the system prefix, `created_at` /
 * `updated_at` are auto-managed). We pass everything else through
 * and let `typecast: true` coerce.
 */
const NOCODB_SYSTEM_KEYS: ReadonlySet<string> = new Set([
  'Id',
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
]);

/**
 * Map a NocoDB row into a Teable `fields` object. Drops NocoDB system
 * keys; preserves everything else including nested objects (NocoDB
 * uses plain objects for select/multi-select lookups).
 */
export function nocodbRowToFields(row: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (NOCODB_SYSTEM_KEYS.has(key)) continue;
    if (key.startsWith('nc_') || key.startsWith('NC_')) continue;
    if (value === null || value === undefined) continue;
    fields[key] = value;
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class NocoDbSourceDriver implements ISourceImportDriver {
  readonly source = 'nocodb' as const;
  private readonly logger = new Logger(NocoDbSourceDriver.name);

  /**
   * `prisma` is marked optional so the unit spec can build the driver
   * without a PrismaService mock; production wiring always supplies
   * it. A future round will add a `NocoDbConnection` table; until then
   * the driver is connection-less (the operator passes the API token
   * via the task payload or a future connection row).
   *
   * `importService` is the real REST API client + record creation
   * coordinator. Optional so the defensive stub path still throws a
   * `NocoDbNotConfiguredError` when DI isn't wired.
   */
  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: NocoDbImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new NocoDbInvalidPayloadError(['spaceId']);
    }
    if (!input.task.remoteId) {
      throw new NocoDbInvalidPayloadError(['remoteId']);
    }
    // Round 36 — record creation requires a destination table on the
    // durable task. Tasks queued without `tableId` (the lightweight
    // pre-flight path) short-circuit cleanly.
    if (!input.task.tableId) {
      throw new NocoDbInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as INocoDbTaskPayload;
    const missing: string[] = [];
    if (!payload.baseId && !input.task.remoteId) missing.push('baseId');
    if (!payload.tableName) missing.push('tableName');
    if (missing.length > 0) {
      throw new NocoDbInvalidPayloadError(missing);
    }
    const baseId = payload.baseId ?? input.task.remoteId;
    const tableName = payload.tableName!;

    // Synchronous cancel guard — same predicate shape as the Sheets driver.
    if (input.isCanceled()) {
      throw new INocoDbImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI. The stub path
    // lets the unit spec assert that validation/cancel paths win
    // before any API call.
    if (!this.importService) {
      this.logger.warn(
        `nocodb import ${input.task.id} requested but NocoDbImportService ` +
          `not yet wired (base=${baseId} table=${tableName})`
      );
      throw new NocoDbNotConfiguredError({ baseId, tableName });
    }

    if (!payload.baseUrl || !payload.apiToken) {
      const missingCreds: string[] = [];
      if (!payload.baseUrl) missingCreds.push('baseUrl');
      if (!payload.apiToken) missingCreds.push('apiToken');
      throw new NocoDbInvalidPayloadError(missingCreds);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean 4xx-equivalent on the durable task row
    // rather than a confusing fetch failure mid-batch.
    const probe = await this.importService.probe(payload.baseUrl, payload.apiToken);
    if (!probe.ok) {
      throw new Error(`nocodb probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `nocodb import ${input.task.id} probe: ok baseCount=${probe.baseCount} ` +
        `tableCount=${probe.tableCount} (base=${baseId})`
    );

    // Cancel guard between probe and record creation — the probe is a
    // network call, so we check again before the write loop.
    if (input.isCanceled()) {
      throw new INocoDbImportCanceledError();
    }

    // Round 36 — delegate the full paginated fetch + batched
    // record-creation loop to `NocoDbImportService.importTable`. The
    // service owns cancel propagation, batch chunking, and the
    // `recordOpenApiV2Service.createRecords` write. The driver stays
    // a thin mapper + entry-point.
    const pageSize = payload.limit ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      baseUrl: payload.baseUrl,
      apiToken: payload.apiToken,
      tableName,
      tableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapRowToFields: nocodbRowToFields,
    });

    this.logger.log(
      `nocodb import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(base=${baseId} table=${tableName})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        baseId,
        tableId: input.task.tableId,
        tableName,
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
