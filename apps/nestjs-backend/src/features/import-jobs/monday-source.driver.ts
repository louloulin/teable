/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * monday.com adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 23 — extension point (stub → typed MONDAY_NOT_CONFIGURED).
 * Round 39 — real wiring (probe + importTable → record creation).
 *   First **GraphQL** source among the migration drivers. Mirrors the
 *   NocoDB Round-36 / Baserow Round-37 / Jira Round-38 driver shape.
 *
 * monday.com data model:
 *   - **boards** (top-level container)
 *   - **groups** (rows of items inside a board, like Kanban columns)
 *   - **items** (the actual records; mapped to rows in Teable)
 *   - **column_values[]** (typed JSON blobs; each column has a `type`
 *     like `status` / `date` / `people` / `numbers` / `dropdown` / …
 *     and a `value` field that's a JSON-encoded string)
 *
 * Pagination: monday.com's `items_page(limit: N, cursor: "...")` —
 * cursor-based. Round 39 walks the cursor until the page is short or
 * `nextCursor` is null.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  MondayImportService,
  IMondayImportCanceledError,
} from '../monday-import/monday-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface IMondayTaskPayload {
  /** monday.com board id (e.g. "1234567890"). Required. */
  boardId?: string;
  /** Optional group id filter (only items in this group). */
  groupId?: string;
  /** Page size override (default 100, monday.com typical max). */
  limit?: number;
  /** API token (Personal Access Token / OAuth). Required by the real driver. */
  apiToken?: string;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
  /** Whether to fetch updates (comments / activity). Default false. */
  includeUpdates?: boolean;
}

/**
 * Thrown when the task payload is missing required monday.com identifiers.
 */
export class MondayInvalidPayloadError extends Error {
  readonly code = 'MONDAY_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `monday import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'MondayInvalidPayloadError';
  }
}

/**
 * Thrown when the payload is valid but the monday.com GraphQL client
 * has not been integrated yet.
 */
export class MondayNotConfiguredError extends Error {
  readonly code = 'MONDAY_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { boardId: string }) {
    const remediation =
      'add MondayImportService: GraphQL POST against https://api.monday.com/v2 ' +
      'with Authorization: <PersonalAccessToken>, query boards(ids: [<boardId>]) { ' +
      'items_page(limit: 100) { cursor items { id name column_values { id type ' +
      'text value } group { id title } } } } with cursor-based pagination on ' +
      'items_page.cursor. Decode each column_values[].value JSON blob into typed ' +
      'cells (status, date, people, numbers, dropdown, …). Optional second pass ' +
      'for updates (comments) via boards.items_page.items.updates. Write through ' +
      'recordOpenApiV2Service.createRecords. Replace the stub body in ' +
      'MondaySourceDriver.runImport().';
    super(
      `monday.com GraphQL client not configured (board=${input.boardId}); ${remediation}`
    );
    this.name = 'MondayNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * monday.com item keys that come back from the GraphQL API but should
 * never be written as a Teable cell directly. `id` is the platform
 * primary key; we preserve it as a reference column. `board` /
 * `group` are nested objects — their string IDs surface as
 * `boardId` / `groupId` columns; the full objects are dropped.
 *
 * `column_values[]` is decoded per-column (each column id becomes a
 * cell key) — see `decodeMondayColumnValue`.
 */
const MONDAY_ITEM_DROP_KEYS: ReadonlySet<string> = new Set([
  'board', // nested object — surface board.id as boardId
  'group', // nested object — surface group.id as groupId
]);

/**
 * Decode a single monday.com column_value entry into a Teable-friendly
 * cell value. The `value` field is a JSON-encoded string that we
 * parse lazily. If the column has a non-empty `text`, we prefer
 * `text` (it's already human-readable); otherwise we fall back to the
 * parsed JSON or the raw value.
 */
function decodeMondayColumnValue(
  columnValue: { id: string; value: string; text: string | null }
): { key: string; cell: unknown } {
  const text = columnValue.text ?? '';
  const raw = columnValue.value ?? '';
  let parsed: unknown = raw;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  // Prefer `text` when present; it's the column's pre-rendered label.
  return { key: columnValue.id, cell: text || parsed };
}

/**
 * Map a monday.com item into a Teable `fields` object. Surfaces `id` /
  * `boardId` / `groupId` / `created_at` / `updated_at` as reference
 * columns and each column_value as a per-column cell. Drops the
 * nested `board` / `group` objects.
 */
export function mondayItemToFields(item: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  // Surface item identifiers at the top level.
  for (const idKey of ['id', 'name', 'created_at', 'updated_at']) {
    const v = item[idKey];
    if (v !== null && v !== undefined && v !== '') fields[idKey] = v;
  }
  // Surface board.id and group.id as scalar reference columns.
  const board = item['board'];
  if (board && typeof board === 'object') {
    const id = (board as { id?: unknown }).id;
    if (id !== undefined) fields['boardId'] = id;
  }
  const group = item['group'];
  if (group && typeof group === 'object') {
    const id = (group as { id?: unknown }).id;
    if (id !== undefined) fields['groupId'] = id;
  }
  // Decode each column_value into a per-column cell.
  const columnValues = item['column_values'];
  if (Array.isArray(columnValues)) {
    for (const cv of columnValues) {
      if (!cv || typeof cv !== 'object') continue;
      const { id, value, text } = cv as { id?: string; value?: string; text?: string | null };
      if (!id) continue;
      const decoded = decodeMondayColumnValue({
        id,
        value: value ?? '',
        text: text ?? null,
      });
      if (decoded.cell !== null && decoded.cell !== undefined && decoded.cell !== '') {
        fields[decoded.key] = decoded.cell;
      }
    }
  }
  // Drop nested objects we already flattened.
  for (const dropKey of MONDAY_ITEM_DROP_KEYS) {
    delete fields[dropKey];
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class MondaySourceDriver implements ISourceImportDriver {
  readonly source = 'monday' as const;
  private readonly logger = new Logger(MondaySourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: MondayImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new MondayInvalidPayloadError(['spaceId']);
    }
    if (!input.task.tableId) {
      throw new MondayInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IMondayTaskPayload;
    const boardId = payload.boardId ?? input.task.remoteId;
    if (!boardId) {
      throw new MondayInvalidPayloadError(['boardId']);
    }

    // Synchronous cancel guard.
    if (input.isCanceled()) {
      throw new IMondayImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `monday import ${input.task.id} requested but MondayImportService ` +
          `not yet wired (board=${boardId})`
      );
      throw new MondayNotConfiguredError({ boardId });
    }

    if (!payload.apiToken) {
      throw new MondayInvalidPayloadError(['apiToken']);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row.
    const probe = await this.importService.probe(payload.apiToken);
    if (!probe.ok) {
      throw new Error(`monday probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `monday import ${input.task.id} probe: ok workspaceCount=${probe.workspaceCount ?? 0} ` +
        `boardCount=${probe.boardCount ?? 0} (board=${boardId})`
    );

    // Cancel guard between probe and record creation.
    if (input.isCanceled()) {
      throw new IMondayImportCanceledError();
    }

    // Round 39 — delegate the full paginated fetch + batched
    // record-creation loop to `MondayImportService.importTable`.
    const pageSize = payload.limit ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      apiToken: payload.apiToken,
      boardId,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapItemToFields: mondayItemToFields,
    });

    this.logger.log(
      `monday import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(board=${boardId})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        boardId,
        workspaceCount: probe.workspaceCount,
        boardCount: probe.boardCount,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        pageSize,
        batchSize,
      },
    };
  }
}
