/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * ClickUp adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 24 — extension point (stub → typed CLICKUP_NOT_CONFIGURED).
 * Round 40 — real wiring (probe + importTable → record creation).
 *   ClickUp's hierarchy is the deepest among migration sources:
 *
 *   **workspace** → **space** → **folder** (optional) → **list** →
 *   **task** (records; can carry subtasks + checklists + comments +
 *   attachments + **custom_fields[]** + tags + assignees).
 *
 * Mirrors the NocoDB Round-36 / Baserow Round-37 / Jira Round-38 /
 * monday Round-39 driver shape. Page-based pagination (ClickUp's
 * `last_page` flag) drives the loop.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ClickUpImportService,
  IClickUpImportCanceledError,
} from '../clickup-import/clickup-import.service';
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
  /** Personal access token. Required by the real driver. */
  apiToken?: string;
  /** Include archived tasks. Default false. */
  includeClosed?: boolean;
  /** Fetch comments per task (1 extra round trip / task). Default false. */
  includeComments?: boolean;
  /** Page size override (default 100, ClickUp max). */
  pageSize?: number;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
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

/**
 * ClickUp task keys that come back from the REST API but should
 * never be written to a Teable cell directly. `id` is the platform
 * primary key — preserved. `status` / `priority` are nested objects —
 * we surface them as scalar cells under `status` / `priority` (using
 * the inner `status` / `priority` string). `assignees[]` is decoded
 * per assignee into a comma-joined string.
 */
const CLICKUP_TASK_DROP_KEYS: ReadonlySet<string> = new Set([
  // We keep id; we surface status.status and priority.priority explicitly below.
  'creator', // nested user object
]);

/**
 * Map a ClickUp task into a Teable `fields` object. Surfaces scalar
 * columns; flattens `status.status` / `priority.priority`; joins
 * `assignees[].username`; surfaces each `custom_fields[]` typed
 * value under its `id` (or `name`) as a per-column cell.
 */
export function clickupTaskToFields(task: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const idKey of ['id', 'name', 'description', 'due_date', 'text_content']) {
    const v = task[idKey];
    if (v !== null && v !== undefined && v !== '') fields[idKey] = v;
  }
  // status: { status: string, color: string } → "status" cell (the inner string)
  const status = task['status'];
  if (status && typeof status === 'object') {
    const s = (status as { status?: unknown }).status;
    if (typeof s === 'string') fields['status'] = s;
  }
  // priority: { id, priority, color } → "priority" cell (the inner string)
  const priority = task['priority'];
  if (priority && typeof priority === 'object') {
    const p = (priority as { priority?: unknown }).priority;
    if (typeof p === 'string' && p !== 'null') fields['priority'] = p;
  }
  // assignees[]: join usernames (or ids) into a single string cell.
  const assignees = task['assignees'];
  if (Array.isArray(assignees) && assignees.length > 0) {
    const usernames = assignees
      .map((a) => {
        if (a && typeof a === 'object') {
          const obj = a as { username?: unknown; id?: unknown };
          if (typeof obj.username === 'string' && obj.username) return obj.username;
          if (typeof obj.id === 'number') return String(obj.id);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
    if (usernames.length > 0) fields['assignees'] = usernames.join(', ');
  }
  // custom_fields[]: typed values — surface as per-column cell keyed by id (fallback to name).
  const customFields = task['custom_fields'];
  if (Array.isArray(customFields)) {
    for (const cf of customFields) {
      if (!cf || typeof cf !== 'object') continue;
      const obj = cf as { id?: string; value?: unknown };
      const fieldKey = obj.id;
      if (!fieldKey) continue;
      const v = obj.value;
      if (v === null || v === undefined || v === '') continue;
      fields[fieldKey] = v;
    }
  }
  for (const dropKey of CLICKUP_TASK_DROP_KEYS) {
    delete fields[dropKey];
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class ClickUpSourceDriver implements ISourceImportDriver {
  readonly source = 'clickup' as const;
  private readonly logger = new Logger(ClickUpSourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: ClickUpImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new ClickUpInvalidPayloadError(['spaceId']);
    }
    if (!input.task.tableId) {
      throw new ClickUpInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IClickUpTaskPayload;
    const listId = payload.listId ?? input.task.remoteId;
    if (!listId) {
      throw new ClickUpInvalidPayloadError(['listId']);
    }

    // Synchronous cancel guard.
    if (input.isCanceled()) {
      throw new IClickUpImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `clickup import ${input.task.id} requested but ClickUpImportService ` +
          `not yet wired (list=${listId})`
      );
      throw new ClickUpNotConfiguredError({ listId });
    }

    if (!payload.apiToken) {
      throw new ClickUpInvalidPayloadError(['apiToken']);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row.
    const probe = await this.importService.probe(payload.apiToken);
    if (!probe.ok) {
      throw new Error(`clickup probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `clickup import ${input.task.id} probe: ok workspaceId=${probe.workspaceId ?? 'unknown'} ` +
        `workspaceName=${probe.workspaceName ?? 'unknown'} spaceCount=${probe.spaceCount ?? 0} ` +
        `(list=${listId})`
    );

    // Cancel guard between probe and record creation.
    if (input.isCanceled()) {
      throw new IClickUpImportCanceledError();
    }

    // Round 40 — delegate the full paginated fetch + batched
    // record-creation loop to `ClickUpImportService.importTable`.
    const pageSize = payload.pageSize ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      apiToken: payload.apiToken,
      listId,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      includeClosed: payload.includeClosed ?? false,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapTaskToFields: clickupTaskToFields,
    });

    this.logger.log(
      `clickup import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(list=${listId})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        listId,
        workspaceId: probe.workspaceId,
        workspaceName: probe.workspaceName,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        pageSize,
        batchSize,
        includeClosed: payload.includeClosed ?? false,
      },
    };
  }
}
