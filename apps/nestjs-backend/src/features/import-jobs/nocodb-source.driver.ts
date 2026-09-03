/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * NocoDB adapter for the unified source-import driver (Phase 4.4+).
 *
 * Phase 4.4+ — extension point. The NocoDB REST API integration
 * (`/api/v1/db/data/<baseId>/<tableName>` with bearer auth) is not
 * wired today. This driver mirrors the Google Sheets pre-Round-12
 * shape:
 *
 *   1. validates that the task carries the minimum NocoDB identifiers
 *      (`baseId`, `tableName`) and that the cancel predicate has not
 *      already fired;
 *   2. throws a typed `NOCODB_NOT_CONFIGURED` error pointing at the
 *      follow-up work. The processor catches the `code` and refuses
 *      to retry (non-retryable), recording the durable task row with
 *      a clear remediation hint.
 *
 * Once a `NocoDbImportService` ships (mirroring
 * `GoogleSheetsImportService`), this driver only needs to replace the
 * throwing block with a row-by-row `runImport` body: bearer token →
 * `GET /api/v1/db/data/<baseId>/<tableName>?limit=&offset=` paginator
 * → header inference → `recordOpenApiV2Service.createRecords`.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
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
  /** NocoDB API token. Optional; read from the connection row once registered. */
  apiToken?: string;
  /** Optional page size override (default 100). */
  limit?: number;
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
   */
  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new NocoDbInvalidPayloadError(['spaceId']);
    }
    if (!input.task.remoteId) {
      throw new NocoDbInvalidPayloadError(['remoteId']);
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
      throw new Error('NOCODB_CANCELED');
    }

    // Probe cancel again before throwing the not-configured error —
    // gives the cancel hot-path a chance to win before the task fails
    // terminally.
    if (input.isCanceled()) {
      throw new Error('NOCODB_CANCELED');
    }

    this.logger.warn(
      `nocodb import ${input.task.id} requested but NocoDB API client ` +
        `not yet wired (base=${baseId} table=${tableName})`
    );
    throw new NocoDbNotConfiguredError({ baseId, tableName });
  }
}
