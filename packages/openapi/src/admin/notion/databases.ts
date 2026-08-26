/**
 * List Notion databases the stored token can see.
 *
 * The wizard calls this from step 2 to populate the database picker. Each
 * entry carries the title extracted from the `title` property array (Notion
 * stores titles as rich_text) so the UI doesn't have to re-parse it.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const notionDatabaseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Notion's raw property descriptors — surfaced so step 3 can preview the mapped fields. */
  properties: z.record(z.unknown()).optional(),
});

export type INotionDatabaseSummary = z.infer<typeof notionDatabaseSummarySchema>;

export const notionDatabasesVoSchema = z.object({
  databases: z.array(notionDatabaseSummarySchema),
  workspaceName: z.string().optional(),
});

export type INotionDatabasesVo = z.infer<typeof notionDatabasesVoSchema>;

export const notionDatabasesQuerySchema = z.object({
  spaceId: z.string().min(1),
});

export type INotionDatabasesQuery = z.infer<typeof notionDatabasesQuerySchema>;

export const NOTION_DATABASES = '/admin/notion/databases';

export const NotionDatabasesRoute: RouteConfig = registerRoute({
  method: 'get',
  path: NOTION_DATABASES,
  description: 'List Notion databases visible to the stored token for the given space',
  request: {
    query: notionDatabasesQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns the databases the Notion integration has access to',
      content: {
        'application/json': {
          schema: notionDatabasesVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const listNotionDatabases = async (query: INotionDatabasesQuery) => {
  return axios.get<INotionDatabasesVo>(NOTION_DATABASES, { params: query });
};
