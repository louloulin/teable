/**
 * Shared Notion API types + a tiny `fetch` wrapper.
 *
 * We avoid `@notionhq/client` (constraint: zero new npm deps) and instead
 * hand-roll the endpoints we need. Every call uses the same headers —
 * bearer token + `Notion-Version: 2022-06-28` — so centralising the wrapper
 * keeps the surface tight and the `Notion-Version` constant in one place.
 *
 * Reference: https://developers.notion.com/reference
 */

export const NOTION_API_VERSION = '2022-06-28';
export const NOTION_API_BASE = 'https://api.notion.com/v1';
export const NOTION_OAUTH_AUTHORIZE = 'https://api.notion.com/v1/oauth/authorize';
export const NOTION_OAUTH_TOKEN = 'https://api.notion.com/v1/oauth/token';

export interface INotionOAuthTokens {
  accessToken: string;
  botId?: string;
  workspaceName?: string;
  workspaceId?: string;
  owner?: { type?: string; user?: { id?: string } | null };
  /** When Notion returns one — some integrations don't get a refresh token. */
  refreshToken?: string | null;
  /** ISO timestamp string, when provided by Notion. */
  expiresAt?: string | null;
}

export interface INotionDatabaseListItem {
  id: string;
  title: string;
  properties: Record<string, unknown>;
}

export interface INotionPageListItem {
  id: string;
  lastEditedTime: string;
  properties: Record<string, unknown>;
}

export interface INotionPageListResult {
  results: INotionPageListItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface INotionNotionPageListQuery {
  pageSize?: number;
  startCursor?: string;
  filter?: {
    /** Notion's `last_edited_time` filter — used for incremental sync. */
    lastEditedTime?: { after?: string; onOrAfter?: string };
  };
}

/** Single rich-text fragment, normalised to plain text + optional link. */
export interface INotionRichText {
  plainText: string;
  href: string | null;
}

/** A raw property value as returned by `/v1/pages/{id}` — typed loosely so
 *  the schema mapper can pick the right shape per property type. */
export interface INotionPropertyValue {
  id: string;
  type: string;
  title?: INotionRichText[];
  rich_text?: INotionRichText[];
  number?: number | null;
  select?: { id?: string; name?: string; color?: string } | null;
  multi_select?: Array<{ id?: string; name?: string; color?: string }>;
  checkbox?: boolean;
  date?: { start: string; end: string | null; time_zone?: string | null } | null;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  formula?: unknown;
  relation?: unknown;
  rollup?: unknown;
  files?: unknown;
  people?: unknown;
  status?: unknown;
  created_by?: unknown;
  created_time?: unknown;
  last_edited_by?: unknown;
  last_edited_time?: string;
}

export interface INotionDatabaseSchema {
  id: string;
  title: INotionRichText[];
  properties: Record<string, INotionPropertySchema>;
}

export interface INotionPropertySchema {
  id: string;
  type: string;
  /** Select option names. Used by the schema mapper to build singleSelect choices. */
  select?: { options: Array<{ id: string; name: string; color: string }> };
  multi_select?: { options: Array<{ id: string; name: string; color: string }> };
  status?: { options: Array<{ id: string; name: string; color: string }> };
  number?: { format: string };
}

export class NotionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

export interface INotionFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** When set, used as the bearer for this call. Defaults to `accessToken`. */
  accessToken?: string;
}

/**
 * Thin `fetch` wrapper. Throws `NotionApiError` on non-2xx so the callers
 * can branch on `status` without sniffing `instanceof Response`.
 */
export const notionFetch = async <T = unknown>(
  path: string,
  accessToken: string,
  options: INotionFetchOptions = {}
): Promise<T> => {
  const url = path.startsWith('http') ? path : `${NOTION_API_BASE}${path}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let parsed: unknown = text;
  if (text && text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave parsed as text — Notion occasionally returns a plain string
    }
  }
  if (!response.ok) {
    const errMessage =
      typeof parsed === 'object' && parsed !== null && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Notion API ${response.status}`;
    const errCode =
      typeof parsed === 'object' && parsed !== null && 'code' in parsed
        ? String((parsed as { code: unknown }).code)
        : undefined;
    throw new NotionApiError(errMessage, response.status, errCode, parsed);
  }
  return parsed as T;
};
