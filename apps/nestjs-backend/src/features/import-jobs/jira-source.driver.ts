/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Jira adapter for the unified source-import driver (Phase 4.4+).
 *
 * Round 22 — extension point (stub → typed JIRA_NOT_CONFIGURED).
 * Round 38 — real wiring (probe + importTable → record creation).
 *   Mirrors the NocoDB Round-36 / Baserow Round-37 driver shape:
 *     1. validates task identifiers (spaceId / projectKey);
 *     2. cancels up-front (synchronous predicate);
 *     3. probes credentials via `importService.probe`;
 *     4. delegates the paginated fetch + batched createRecords loop
 *        to `importService.importTable` with `mapIssueToFields` from
 *        the driver.
 *
 * Jira-specific notes:
 *   - Auth: Basic with `email:apiToken` (not just a token).
 *   - Data model: **issues** (not rows). Each issue carries nested
 *     `fields` (summary, description ADF, status, priority, etc.).
 *   - Pagination: legacy GET /search uses `startAt` offset (kept
 *     for stability; the new POST /search/jql + nextPageToken is a
 *     follow-up round if Jira sunsets /search).
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  JiraImportService,
  IJiraImportCanceledError,
} from '../jira-import/jira-import.service';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { PrismaService } from '@teable/db-main-prisma';

export interface IJiraTaskPayload {
  /** Jira cloud id (e.g. "ari:cloud:jira::site/<uuid>" for Atlassian Cloud). */
  cloudId?: string;
  /** Project key (e.g. "ENG") or id (e.g. "10001"). */
  projectKey?: string;
  /** Jira site URL, e.g. `https://example.atlassian.net`. Required by the real driver. */
  siteUrl?: string;
  /** Atlassian account email used for Basic auth. Required by the real driver. */
  email?: string;
  /** Jira API token. Required by the real driver. */
  apiToken?: string;
  /** Optional JQL filter to scope the import (e.g. `project = ENG AND type = Bug`). */
  jql?: string;
  /** Page size override (default 100, Jira max). */
  maxResults?: number;
  /** Batch size for createRecords calls. Defaults to 100; capped to 1000. */
  batchSize?: number;
  /** Whether to fetch comments (default false — 1 extra round trip per issue). */
  includeComments?: boolean;
}

/**
 * Thrown when the task payload is missing required Jira identifiers.
 */
export class JiraInvalidPayloadError extends Error {
  readonly code = 'JIRA_INVALID_PAYLOAD';
  constructor(missing: ReadonlyArray<string>) {
    super(
      `jira import payload missing required fields: ${missing.join(', ')}`
    );
    this.name = 'JiraInvalidPayloadError';
  }
}

/**
 * Thrown when the payload is valid but the Jira REST API client has
 * not been integrated yet.
 */
export class JiraNotConfiguredError extends Error {
  readonly code = 'JIRA_NOT_CONFIGURED';
  readonly remediation: string;

  constructor(input: { projectKey: string }) {
    const remediation =
      'add JiraImportService: OAuth 2.0 (3LO) or API token against ' +
      'https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/, resolve ' +
      'projectKey via /rest/api/3/project/{key}, stream issues via the NEW ' +
      '/rest/api/3/search/jql POST endpoint with nextPageToken cursor paging, ' +
      'flatten ADF descriptions + nested fields into rows, write through ' +
      'recordOpenApiV2Service.createRecords. Optional second pass for ' +
      'comments (/rest/api/3/issue/{key}/comment). Replace the stub body in ' +
      'JiraSourceDriver.runImport().';
    super(
      `Jira REST API client not configured (project=${input.projectKey}); ${remediation}`
    );
    this.name = 'JiraNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * Jira issue keys that come back from the REST API but should never
 * be written to a Teable cell. `id` + `key` are platform primary
 * identifiers; we surface them as Teable cells under the same names
 * (kept) and drop the bookkeeping `expand` / `self` URLs.
 */
const JIRA_SYSTEM_KEYS: ReadonlySet<string> = new Set([
  'self',
  'expand',
]);

/**
 * Map a Jira issue into a Teable `fields` object.
 *
 * Flattens `issue.fields` into top-level keys (since `issue.fields`
 * is a JSON object, not a list) so each scalar lives as its own
 * column. Drops `self` / `expand` URLs. Preserves `id` + `key` as
 * reference columns.
 */
export function jiraIssueToFields(issue: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  // Surface issue identifiers at the top level.
  for (const idKey of ['id', 'key']) {
    const v = issue[idKey];
    if (v !== null && v !== undefined) fields[idKey] = v;
  }
  // Flatten `fields` into top-level columns.
  const inner = issue['fields'];
  if (inner && typeof inner === 'object') {
    for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      if (JIRA_SYSTEM_KEYS.has(k)) continue;
      fields[k] = v;
    }
  }
  return fields;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

@Injectable()
export class JiraSourceDriver implements ISourceImportDriver {
  readonly source = 'jira' as const;
  private readonly logger = new Logger(JiraSourceDriver.name);

  constructor(
    @Optional() private readonly _prisma?: PrismaService,
    @Optional() private readonly importService?: JiraImportService
  ) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new JiraInvalidPayloadError(['spaceId']);
    }
    if (!input.task.tableId) {
      throw new JiraInvalidPayloadError(['tableId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IJiraTaskPayload;
    const projectKey = payload.projectKey ?? input.task.remoteId ?? undefined;
    if (!projectKey) {
      throw new JiraInvalidPayloadError(['projectKey']);
    }

    // Synchronous cancel guard.
    if (input.isCanceled()) {
      throw new IJiraImportCanceledError();
    }

    // Defensive guard — production wiring always supplies the
    // import service via the SourceImportModule DI.
    if (!this.importService) {
      this.logger.warn(
        `jira import ${input.task.id} requested but JiraImportService ` +
          `not yet wired (project=${projectKey})`
      );
      throw new JiraNotConfiguredError({ projectKey });
    }

    if (!payload.siteUrl || !payload.email || !payload.apiToken) {
      const missing: string[] = [];
      if (!payload.siteUrl) missing.push('siteUrl');
      if (!payload.email) missing.push('email');
      if (!payload.apiToken) missing.push('apiToken');
      throw new JiraInvalidPayloadError(missing);
    }

    // Probe credential validity before doing any work — surfaces
    // expired tokens as a clean error on the durable task row.
    const probe = await this.importService.probe(
      payload.siteUrl,
      payload.email,
      payload.apiToken
    );
    if (!probe.ok) {
      throw new Error(`jira probe failed: ${probe.error ?? 'unknown error'}`);
    }
    this.logger.log(
      `jira import ${input.task.id} probe: ok accountId=${probe.accountId ?? 'unknown'} ` +
        `displayName=${probe.displayName ?? 'unknown'} projectCount=${probe.projectCount ?? 0} ` +
        `(project=${projectKey})`
    );

    // Cancel guard between probe and record creation.
    if (input.isCanceled()) {
      throw new IJiraImportCanceledError();
    }

    // Round 38 — delegate the full paginated fetch + batched
    // record-creation loop to `JiraImportService.importTable`.
    const jql = payload.jql ?? `project = ${projectKey} ORDER BY created DESC`;
    const pageSize = payload.maxResults ?? DEFAULT_PAGE_SIZE;
    const batchSize = Math.min(
      Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE),
      MAX_BATCH_SIZE
    );
    const result = await this.importService.importTable({
      siteUrl: payload.siteUrl,
      email: payload.email,
      apiToken: payload.apiToken,
      jql,
      destinationTableId: input.task.tableId,
      pageSize,
      batchSize,
      isCanceled: input.isCanceled,
      onProgress: input.onProgress,
      mapIssueToFields: jiraIssueToFields,
    });

    this.logger.log(
      `jira import ${input.task.id} done: imported=${result.processedCount} ` +
        `failed=${result.failedCount} total=${result.totalCount} ` +
        `(project=${projectKey})`
    );
    return {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      result: {
        projectKey,
        jql,
        displayName: probe.displayName,
        totalSeen: result.totalCount,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        siteUrl: payload.siteUrl,
        pageSize,
        batchSize,
      },
    };
  }
}
