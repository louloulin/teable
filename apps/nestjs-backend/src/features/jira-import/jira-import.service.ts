import { Injectable, Logger } from '@nestjs/common';
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
 * Jira-specific fields (priority, custom fields, ADF description body)
 * are kept as opaque blobs in this round; downstream translator handles them.
 */
@Injectable()
export class JiraImportService {
  private readonly logger = new Logger(JiraImportService.name);

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
}
