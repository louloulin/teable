/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * ClickUp adapter for the unified source-import driver (Phase 4.4+).
 *
 * ClickUp's hierarchy is deeper than the other drivers:
 *
 *   **workspace** → **space** → **folder** (optional) → **list** →
 *   **task** (the records; can carry subtasks + checklists + comments
 *   + attachments + custom fields + tags + assignees)
 *
 * The Phase 4.4+ stub below only validates the task payload. A future
 * round will add `ClickUpImportService` that:
 *
 *   1. Resolves the target list via
 *      `GET https://api.clickup.com/api/v2/list/<listId>`;
 *   2. Streams tasks via `GET /api/v2/list/<listId>/task?page=&include_closed=`
 *      with page-based pagination (ClickUp uses pages, not cursors;
 *      `last_page` field tells us when to stop);
 *   3. Decodes **custom fields** (typed: drop-down, labels, currency,
 *      email, phone, short_text, long_text, url, …) from the
 *      `custom_fields[]` array on each task;
 *   4. Optionally fetches comments via
 *      `GET /api/v2/task/<taskId>/comment` (one extra round trip per
 *      task — opt-in via `includeComments`);
 *   5. Writes through `recordOpenApiV2Service.createRecords`.
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

export interface IClickUpTaskPayload {
  /** ClickUp workspace id. Optional — if missing, inferred from list. */
  workspaceId?: string;
  /** ClickUp space id. Optional — if missing, inferred from list. */
  spaceId?: string;
  /** ClickUp folder id. Optional — folders are nested under spaces. */
  folderId?: string;
  /** ClickUp list id to read from. Falls back to `task.remoteId`. Required. */
  listId?: string;
  /** Include archived tasks. Default false. */
  includeClosed?: boolean;
  /** Fetch comments per task (1 extra round trip / task). Default false. */
  includeComments?: boolean;
  /** Page size override (default 100, ClickUp max). */
  pageSize?: number;
}

/**
 * Thrown when the task payload is missing required ClickUp identifiers.
 */
export class ClickUpInvalidPayloadError extends Error {
  readonly code = 'CLICKUP_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `clickup import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'ClickUpInvalidPayloadError';
  }
}

/**
 * Thrown when the payload is valid but the ClickUp REST client has
 * not been integrated yet.
 */
export class ClickUpNotConfiguredError extends Error {
  readonly code = 'CLICKUP_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { listId: string }) {
    const remediation =
      'add ClickUpImportService: bearer auth against https://api.clickup.com/api/v2 ' +
      '(Authorization header, NOT Bearer prefix), resolve listId via ' +
      'GET /api/v2/list/<listId>, stream tasks via ' +
      'GET /api/v2/list/<listId>/task?page=&include_closed=&custom_fields= with ' +
      'page-based pagination (last_page field), decode custom_fields[] typed ' +
      'values (drop_down, labels, currency, email, phone, short_text, long_text, ' +
      'url, date, etc.), optional second pass for comments via ' +
      'GET /api/v2/task/<taskId>/comment. Write through ' +
      'recordOpenApiV2Service.createRecords. Replace the stub body in ' +
      'ClickUpSourceDriver.runImport().';
    super(
      `ClickUp REST client not configured (list=${input.listId}); ${remediation}`
    );
    this.name = 'ClickUpNotConfiguredError';
    this.remediation = remediation;
  }
}

@Injectable()
export class ClickUpSourceDriver implements ISourceImportDriver {
  readonly source = 'clickup' as const;
  private readonly logger = new Logger(ClickUpSourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new ClickUpInvalidPayloadError(['spaceId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IClickUpTaskPayload;
    const listId = payload.listId ?? input.task.remoteId;
    if (!listId) {
      throw new ClickUpInvalidPayloadError(['listId']);
    }

    if (input.isCanceled()) {
      throw new Error('CLICKUP_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('CLICKUP_CANCELED');
    }

    this.logger.warn(
      `clickup import ${input.task.id} requested but ClickUp REST client ` +
        `not yet wired (list=${listId})`
    );
    throw new ClickUpNotConfiguredError({ listId });
  }
}
