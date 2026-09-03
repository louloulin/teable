import { Injectable, Logger } from '@nestjs/common';
import type {
  JiraConnectionProbe,
  JiraIssue,
  JiraProject,
} from './jira-import.types';

/**
 * Round-18: Minimal Jira Cloud REST API v3 client. Provides:
 *   - probe() — verify creds against /myself
 *   - listProjects() — /project/search
 *   - listIssues() — /search with JQL
 *
 * Round-38: adds `listIssues(jql, maxResults, startAt)` so the
 * record-creation path can paginate via `startAt` + `maxResults`
 * (Jira's legacy GET /search uses `startAt` offset paging; the new
 * POST /search/jql uses `nextPageToken` but the legacy endpoint
 * remains stable and well-documented, so we keep it for now).
 *
 * Auth: HTTP Basic with email:api_token (base64-encoded).
 * URL template: https://<site>.atlassian.net/rest/api/3/
 */
@Injectable()
export class JiraApiClient {
  private readonly logger = new Logger(JiraApiClient.name);

  constructor(
    private readonly siteUrl: string,
    private readonly email: string,
    private readonly apiToken: string
  ) {
    this.siteUrl = siteUrl.replace(/\/$/, '');
  }

  private get authHeader(): string {
    const cred = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return `Basic ${cred}`;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.siteUrl}/rest/api/3${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Jira API ${path} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  async listProjects(maxResults = 50): Promise<JiraProject[]> {
    const data = await this.fetchJson<{ values: JiraProject[] }>(
      `/project/search?maxResults=${maxResults}`
    );
    return data.values ?? [];
  }

  /**
   * List issues matching the given JQL.
   *
   * @param jql        JQL query string
   * @param maxResults page size (default 100, Jira max 100)
   * @param startAt    offset for sequential paging (Round-38). Defaults
   *                   to 0 for backward compatibility with the
   *                   pre-Round-38 controller.
   */
  async listIssues(
    jql = 'ORDER BY created DESC',
    maxResults = 100,
    startAt = 0
  ): Promise<JiraIssue[]> {
    const params = new URLSearchParams();
    params.set('jql', jql);
    params.set('maxResults', String(maxResults));
    if (startAt > 0) params.set('startAt', String(startAt));
    params.set(
      'fields',
      'summary,description,status,priority,assignee,reporter,created,updated,issuetype'
    );
    const data = await this.fetchJson<{ issues: JiraIssue[] }>(
      `/search?${params.toString()}`
    );
    return data.issues ?? [];
  }

  async probe(): Promise<{
    ok: boolean;
    accountId?: string;
    displayName?: string;
    projectCount?: number;
    error?: string;
  }> {
    try {
      const me = await this.fetchJson<{
        accountId: string;
        displayName: string;
      }>('/myself');
      const projects = await this.listProjects(10);
      return {
        ok: true,
        accountId: me.accountId,
        displayName: me.displayName,
        projectCount: projects.length,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`jira probe failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
