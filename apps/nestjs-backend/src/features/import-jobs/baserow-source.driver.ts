/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Baserow adapter for the unified source-import driver (Phase 4.4+).
 *
 * Phase 4.4+ — extension point. The Baserow REST API integration
 * (`/api/database/rows/table/<tableId>/` with token auth) is not wired
 * today. Mirrors the NocoDB / Sheets pre-Round-12 stub shape:
 *
 *   1. validates the task carries the minimum Baserow identifiers
 *      (`tableId`, `viewId` optional) and the cancel predicate has not
 *      already fired;
 *   2. throws a typed `BASEROW_NOT_CONFIGURED` error pointing at the
 *      follow-up work. The processor catches the `code` and refuses
 *      to retry (non-retryable).
 *
 * Once a `BaserowImportService` ships, this driver only needs to
 * replace the throwing block with a row-by-row `runImport` body:
 * token auth against
 * `GET /api/database/rows/table/<tableId>/?user_field_names=true&page=`,
 * cursor paging, field-type mapping, then `recordOpenApiV2Service.createRecords`.
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

export interface IBaserowTaskPayload {
  /** Baserow database id (the workspace-scoped database that owns the table). */
  databaseId?: string;
  /** Baserow table id to read from. Falls back to `task.remoteId` when absent. */
  tableId?: string;
  /** Optional Baserow view id (filters rows + respects ordering). */
  viewId?: string;
  /** API token. Read from the connection row once registered. */
  apiToken?: string;
  /** Page size override (default 200, Baserow max). */
  size?: number;
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
 * Thrown when the payload is valid but the Baserow REST API client
 * has not been integrated yet.
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

@Injectable()
export class BaserowSourceDriver implements ISourceImportDriver {
  readonly source = 'baserow' as const;
  private readonly logger = new Logger(BaserowSourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new BaserowInvalidPayloadError(['spaceId']);
    }
    if (!input.task.remoteId) {
      throw new BaserowInvalidPayloadError(['remoteId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IBaserowTaskPayload;
    // tableId can come from payload OR task.remoteId (when the task is
    // explicitly a single-table import). Either is valid.
    const tableId = payload.tableId ?? input.task.remoteId;
    if (!tableId) {
      throw new BaserowInvalidPayloadError(['tableId']);
    }

    if (input.isCanceled()) {
      throw new Error('BASEROW_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('BASEROW_CANCELED');
    }

    this.logger.warn(
      `baserow import ${input.task.id} requested but Baserow API client ` +
        `not yet wired (table=${tableId})`
    );
    throw new BaserowNotConfiguredError({ tableId });
  }
}
