/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Jira adapter for the unified source-import driver (Phase 4.4+).
 *
 * Jira's data model differs from the table-based drivers (Sheets /
 * Airtable / NocoDB / Baserow): the source-of-truth is **issues**
 * (not rows), grouped by **projects**. Each issue carries:
 *
 *   - scalar fields: summary, description (ADF or plain), priority,
 *     labels, status (FK → workflow), assignee, reporter, due date,
 *     created / updated timestamps;
 *   - structured fields: components, fixVersions, affectsVersions,
 *     attachments, subtasks, linked issues;
 *   - comments, worklogs, history (separate REST endpoints).
 *
 * The Phase 4.4+ stub below only validates the task payload. A
 * future round will add `JiraImportService` that:
 *
 *   1. Resolves `projectKey` → `projectId` via `/rest/api/3/project/{key}`;
 *   2. Streams issues via the **new** `/rest/api/3/search/jql` POST
 *      endpoint with cursor-based `nextPageToken` pagination;
 *   3. Flattens each issue's nested fields into a single row (one
 *      column per scalar; arrays become JSON cell values);
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

export interface IJiraTaskPayload {
  /** Jira cloud id (e.g. "ari:cloud:jira::site/<uuid>" for Atlassian Cloud). */
  cloudId?: string;
  /** Project key (e.g. "ENG") or id (e.g. "10001"). */
  projectKey?: string;
  /** Optional JQL filter to scope the import (e.g. `project = ENG AND type = Bug`). */
  jql?: string;
  /** Page size override (default 100, Jira max). */
  maxResults?: number;
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

@Injectable()
export class JiraSourceDriver implements ISourceImportDriver {
  readonly source = 'jira' as const;
  private readonly logger = new Logger(JiraSourceDriver.name);

  constructor(@Optional() private readonly _prisma?: PrismaService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId) {
      throw new JiraInvalidPayloadError(['spaceId']);
    }
    const payload = (input.task.payload ?? {}) as unknown as IJiraTaskPayload;
    const projectKey = payload.projectKey ?? input.task.remoteId ?? undefined;
    if (!projectKey) {
      throw new JiraInvalidPayloadError(['projectKey']);
    }

    if (input.isCanceled()) {
      throw new Error('JIRA_CANCELED');
    }
    if (input.isCanceled()) {
      throw new Error('JIRA_CANCELED');
    }

    this.logger.warn(
      `jira import ${input.task.id} requested but Jira API client not yet ` +
        `wired (project=${projectKey})`
    );
    throw new JiraNotConfiguredError({ projectKey });
  }
}
