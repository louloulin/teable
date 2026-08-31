/**
 * Jira Import — Round-18 minimal types.
 *
 * Jira Cloud REST API v3 base: https://<site>.atlassian.net/rest/api/3/
 * Auth: HTTP Basic with email + API token (base64-encoded "email:token").
 * Hierarchy: Project > Issue (with type, status, priority, assignee, custom fields).
 */

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  issueTypes?: Array<{ id: string; name: string; subtask: boolean }>;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
    status?: { name: string; id: string };
    priority?: { name: string; id: string };
    assignee?: { accountId: string; displayName: string };
    reporter?: { accountId: string; displayName: string };
    created?: string;
    updated?: string;
    issuetype?: { name: string; id: string };
    [customField: string]: unknown;
  };
}

export interface JiraConnectionProbe {
  ok: boolean;
  siteUrl?: string;
  accountId?: string;
  displayName?: string;
  projectCount?: number;
  error?: string;
  fetchedAt: string;
}
