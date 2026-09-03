/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SmartSuite adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 25 — extension point (stub → typed SMARTSUITE_NOT_CONFIGURED).
 * Round 41 — real wiring (probe + importTable → record creation).
 *   Mirrors the NocoDB Round-36 / Baserow Round-37 / Jira Round-38 /
 *   monday Round-39 / ClickUp Round-40 driver shape.
 *
 * SmartSuite data model:
 *   - **workspace** → **solution** (a packaged app bundle)
 *   - **app** (the table)
 *   - **record** (the row, with `fields` object containing typed
 *     cell values per the field-type registry)
 *
 * Pagination: `offset` (response) + `limit` (request). SmartSuite
 * returns the next offset, or null when there are no more pages.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  SmartSuiteImportService,
  ISmartSuiteImportCanceledError,
} from '../smartsuite-import/smartsuite-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface ISmartSuiteTaskPayload {
  /** SmartSuite workspace id (tenant). Optional. */
  workspaceId?: string;
  /** SmartSuite solution id (the packaged app bundle). Optional. */
  solutionId?: string;
  /** SmartSuite app id (the table). Falls back to `task.remoteId`. Required. */
  appId?: string;
  /** Page size override (default 100, SmartSuite typical max). */
  limit?: number;
  /** API key (Bearer auth). Required by the real driver. */
  apiKey?: string;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
  /** Whether to fetch comments. Default false. */
  includeComments?: boolean;
}

export class SmartSuiteInvalidPayloadError extends Error {
  readonly code = 'SMARTSUITE_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `smartsuite import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'SmartSuiteInvalidPayloadError';
  }
}

export class SmartSuiteNotConfiguredError extends Error {
  readonly code = 'SMARTSUITE_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { appId: string }) {
    const remediation =
      'add SmartSuiteImportService: Bearer auth (Authorization: Bearer <key>) ' +
      'against https://api.smartsuite.com/api/v1/, stream records via ' +
      'POST /applications/<appId>/records/list/ with { filters, limit, offset } ' +
      'body; response.offset is the NEXT offset (null = end), decode the per-app ' +
      'field type registry (singleselect, multiselect, text, number, date, ' +
      'datetime, user, file, checklist, linkedrecord, …) into typed cell values, ' +
      'write through recordOpenApiV2Service.createRecords. Replace the stub ' +
      'body in SmartSuiteSourceDriver.runImport().';
    super(
      `SmartSuite REST client not configured (app=${input.appId}); ${remediation}`
    );
    this.name = 'SmartSuiteNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * SmartSuite record keys that come back from the REST API but should
 * never be written to a Teable cell directly. `id` is the platform
 * primary key — preserved. `app_id` / `table_id` are nested FKs —
 * surfaced as scalar columns. `fields` is the typed cell payload —
 * spread into top-level keys.
 */
const SMARTSUITE_RECORD_DROP_KEYS: ReadonlySet<string> = new Set([
  'fields', // expanded into top-level cells
]);

/**
 * Map a SmartSuite record into a Teable `fields` object. Surfaces
 * scalar columns + flattens the `fields` envelope into top-level
 * cells (each app's `field_id` becomes a cell key).
 */
export function smartsuiteRecordToFields(
  record: Record<string, unknown>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const idKey of ['id', 'app_id', 'table_id', 'title', 'created_at', 'updated_at']) {
    const v = record[idKey];
    if (v !== null && v !== undefined && v !== '') fields[idKey] = v;
  }
  // Spread `record.fields` into top-level cell map.
  const inner = record['fields'];
  if (inner && typeof inner === 'object') {
    for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      fields[k] = v;
    }
  }
  for (const dropKey of SMARTSUITE_RECORD_DROP_KEYS) {
    delete fields[dropKey];
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class SmartSuiteSourceDriver implements ISourceImportDriver {
  readonly source = 'smartsuite' as const;
  private readonly logger = new Logger(SmartSuiteSourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: SmartSuiteImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new SmartSuiteInvalidPayloadError(['spaceId']);
    }
    if (!input.task.tableId) {
      throw new SmartSuiteInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as ISmartSuiteTaskPayload;
    const appId = payload.appId ?? input.task.remoteId;
    if (!appId) {
      throw new SmartSuiteInvalidPayloadError(['appId']);
    }

    // Synchronous cancel guard.
    if (input.isCanceled()) {
      throw new ISmartSuiteImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `smartsuite import ${input.task.id} requested but SmartSuiteImportService ` +
          `not yet wired (app=${appId})`
      );
      throw new SmartSuiteNotConfiguredError({ appId });
    }

    if (!payload.apiKey) {
      throw new SmartSuiteInvalidPayloadError(['apiKey']);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row.
    const probe = await this.importService.probe(payload.apiKey);
    if (!probe.ok) {
      throw new Error(`smartsuite probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `smartsuite import ${input.task.id} probe: ok appCount=${probe.appCount ?? 0} ` +
        `tableCount=${probe.tableCount ?? 0} (app=${appId})`
    );

    // Cancel guard between probe and record creation.
    if (input.isCanceled()) {
      throw new ISmartSuiteImportCanceledError();
    }

    // Round 41 — delegate the full paginated fetch + batched
    // record-creation loop to `SmartSuiteImportService.importTable`.
    const pageSize = payload.limit ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      apiToken: payload.apiKey,
      appId,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapRecordToFields: smartsuiteRecordToFields,
    });

    this.logger.log(
      `smartsuite import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(app=${appId})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        appId,
        appCount: probe.appCount,
        tableCount: probe.tableCount,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        pageSize,
        batchSize,
      },
    };
  }
}
