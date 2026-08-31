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

  async listIssues(
    jql = 'ORDER BY created DESC',
    maxResults = 100
  ): Promise<JiraIssue[]> {
    const data = await this.fetchJson<{ issues: JiraIssue[] }>(
      `/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,status,priority,assignee,reporter,created,updated,issuetype`
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
