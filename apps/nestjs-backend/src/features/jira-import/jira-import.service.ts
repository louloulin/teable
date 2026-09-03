import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { JiraApiClient } from './jira-api.client';
import type {
  JiraConnectionProbe,
  JiraIssue,
  JiraProject,
} from './jira-import.types';

/**
 * Round-18: Jira migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) pattern. Provides:
 *   1. Credential probe — /myself + project count
 *   2. List projects — /project/search
 *   3. Fetch issues — /search with JQL
 *
 * Round-38: adds `listAllIssues` (startAt pagination + cancel guards)
 * + `importTable` (record-creation path via
 * `recordOpenApiV2Service.createRecords` in 100-row batches with cancel
 * + progress hooks). Mirrors the NocoDB / Baserow driver shape so the
 * source-driver pattern stays uniform across REST sources.
 */
@Injectable()
export class JiraImportService {
  private readonly logger = new Logger(JiraImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(
    siteUrl: string,
    email: string,
    apiToken: string
  ): Promise<JiraConnectionProbe> {
    const client = new JiraApiClient(siteUrl, email, apiToken);
    return client.probe().then((p) => ({
      ...p,
      siteUrl,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listProjects(
    siteUrl: string,
    email: string,
    apiToken: string,
    maxResults = 50
  ): Promise<JiraProject[]> {
    const client = new JiraApiClient(siteUrl, email, apiToken);
    return client.listProjects(maxResults);
  }

  /**
   * Lightweight pre-flight: returns issueCount + 5-issue sample so the
   * source driver can confirm connectivity + data shape before
   * committing to a full migration. The full record-creation path
   * uses `listAllIssues` instead.
   */
  async fetchIssues(
    siteUrl: string,
    email: string,
    apiToken: string,
    jql?: string,
    maxResults = 100
  ): Promise<{ jql: string; issueCount: number; sample: JiraIssue[] }> {
    const client = new JiraApiClient(siteUrl, email, apiToken);
    const finalJql = jql ?? 'ORDER BY created DESC';
    const issues = await client.listIssues(finalJql, maxResults);
    return {
      jql: finalJql,
      issueCount: issues.length,
      sample: issues.slice(0, 5),
    };
  }

  /**
   * Round-38: full paginated issue fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `IJiraImportCanceledError` (code `JIRA_CANCELED`) when the
   * predicate fires so the processor can reconcile the final state
   * without counting the partial run as a failure.
   *
   * Caps the number of pages at 500 to keep the durable task bounded
   * (50K issues at pageSize=100).
   */
  async listAllIssues(
    siteUrl: string,
    email: string,
    apiToken: string,
    jql: string,
    pageSize = 100,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<JiraIssue[]> {
    const client = new JiraApiClient(siteUrl, email, apiToken);
    const collected: JiraIssue[] = [];
    let startAt = 0;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new IJiraImportCanceledError();
      }
      const issues = await client.listIssues(jql, pageSize, startAt);
      if (issues.length === 0) break;
      collected.push(...issues);
      startAt += issues.length;
      onPage?.({ fetched: collected.length });
      if (issues.length < pageSize) break;
    }
    if (isCanceled()) {
      throw new IJiraImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-38 record-creation path. Fetches every page of issues,
   * converts each issue to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapIssueToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    siteUrl: string;
    email: string;
    apiToken: string;
    jql: string;
    destinationTableId: string;
    pageSize?: number;
    batchSize?: number;
    isCanceled: () => boolean;
    onProgress?: (counts: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
    }) => void | Promise<void>;
    mapIssueToFields: (issue: Record<string, unknown>) => Record<string, unknown>;
  }): Promise<{
    processedCount: number;
    failedCount: number;
    totalCount: number;
  }> {
    const pageSize = input.pageSize ?? 100;
    const batchSize = Math.min(
      Math.max(1, input.batchSize ?? 100),
      1000
    );

    let totalSeen = 0;
    const issues = await this.listAllIssues(
      input.siteUrl,
      input.email,
      input.apiToken,
      input.jql,
      pageSize,
      input.isCanceled,
      ({ fetched }) => {
        totalSeen = fetched;
      }
    );

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < issues.length; i += batchSize) {
      if (input.isCanceled()) {
        throw new IJiraImportCanceledError();
      }
      const chunk = issues.slice(i, i + batchSize);
      const records = chunk.map((issue) => ({
        fields: input.mapIssueToFields(issue as unknown as Record<string, unknown>),
      }));
      if (records.length === 0) continue;
      try {
        await this.records.createRecords(input.destinationTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records,
        });
        processedCount += records.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `jira import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
        );
        failedCount += records.length;
      }
      await input.onProgress?.({
        processedCount,
        failedCount,
        totalCount: totalSeen,
      });
    }

    if (input.isCanceled()) {
      throw new IJiraImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-38: thrown by `listAllIssues` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError` /
 * `IBaserowImportCanceledError` pattern; the processor maps the
 * `code` to a no-op success (via `KNOWN_CANCEL_CODES`).
 */
export class IJiraImportCanceledError extends Error {
  readonly code = 'JIRA_CANCELED';
  constructor() {
    super('jira import was canceled');
    this.name = 'IJiraImportCanceledError';
  }
}
