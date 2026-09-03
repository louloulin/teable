/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * monday.com adapter for the unified source-import driver (Phase 4.4+).
 *
 * monday.com is the first **GraphQL** source among the migration
 * drivers (REST-so-far: Sheets / NocoDB / Baserow / Jira). Its data
 * model is also unique:
 *
 *   - **boards** (top-level container, like a workspace)
 *   - **groups** (rows of items inside a board, like Kanban columns)
 *   - **items** (the actual records; mapped to rows in Teable)
 *   - **column_values** (typed JSON blobs; each column has a `type`
 *     like `status`, `date`, `people`, `numbers`, `dropdown`, … and
 *     a `value` field that's a JSON-encoded string)
 *   - **updates** (comments / activity log; optional second pass)
 *
 * The Phase 4.4+ stub below only validates the task payload. A
 * future round will add `MondayImportService` that:
 *
 *   1. POSTs GraphQL to `https://api.monday.com/v2` with the bearer
 *      `Authorization` header;
 *   2. Runs `query { boards(ids: [<boardId>]) { items_page(limit: 100)
 *      { cursor items { id name column_values { id type text value }
 *      group { id title } } } } }` with cursor paging on `cursor`;
 *   3. Decodes each `column_values[].value` JSON blob into a typed
 *      cell value (status → string, numbers → number, dropdown → array
 *      of label strings, etc.);
 *   4. Writes through `recordOpenApiV2Service.createRecords`.
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

export interface IMondayTaskPayload {
  /** monday.com board id (e.g. "1234567890"). Required. */
  boardId?: string;
  /** Optional group id filter (only items in this group). */
  groupId?: string;
  /** Page size override (default 100, monday.com typical max). */
  limit?: number;
  /** API token (Personal Access Token / OAuth). Read from connection row once registered. */
  apiToken?: string;
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

@Injectable()
export class MondaySourceDriver implements ISourceImportDriver {
  readonly source = 'monday' as const;
  private readonly logger = new Logger(MondaySourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new MondayInvalidPayloadError(['spaceId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IMondayTaskPayload;
    const boardId = payload.boardId ?? input.task.remoteId;
    if (!boardId) {
      throw new MondayInvalidPayloadError(['boardId']);
    }

    if (input.isCanceled()) {
      throw new Error('MONDAY_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('MONDAY_CANCELED');
    }

    this.logger.warn(
      `monday import ${input.task.id} requested but monday.com GraphQL ` +
        `client not yet wired (board=${boardId})`
    );
    throw new MondayNotConfiguredError({ boardId });
  }
}
