/**
 * Run the Notion database → Teable table import. Pages become records in
 * `tableId` (the caller picks an existing Teable table to import into — the
 * wizard creates one with the mapped schema as part of step 3).
 *
 * The response carries an explicit `skipped` count so the wizard can show
 * "imported N, skipped M" without making a follow-up call to the table.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const notionImportRoSchema = z.object({
  spaceId: z.string().min(1),
  tableId: z.string().min(1),
  databaseId: z.string().min(1),
  /** When true, only pages with `last_edited_time > since` are imported. */
  incremental: z.boolean().optional().default(false),
});

export type INotionImportRo = z.infer<typeof notionImportRoSchema>;

export const notionImportVoSchema = z.object({
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
  /** Highest `last_edited_time` we saw — store as the next incremental cursor. */
  lastEditedTime: z.string().optional(),
});

export type INotionImportVo = z.infer<typeof notionImportVoSchema>;

export const NOTION_IMPORT = '/admin/notion/import';

export const NotionImportRoute: RouteConfig = registerRoute({
  method: 'post',
  path: NOTION_IMPORT,
  description: 'Import pages from a Notion database into a Teable table',
  request: {
    body: {
      content: {
        'application/json': {
          schema: notionImportRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import completed with imported + skipped counts',
      content: {
        'application/json': {
          schema: notionImportVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const importNotionDatabase = async (input: INotionImportRo) => {
  return axios.post<INotionImportVo>(NOTION_IMPORT, input);
};
