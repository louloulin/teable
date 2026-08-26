/**
 * Disconnect endpoint — wipes the stored Notion token for the requested
 * space. Mirrors the `airtableDisconnect` shape so the UI can call either
 * helper without a discriminator.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const notionDisconnectRoSchema = z.object({
  spaceId: z.string().min(1),
});

export type INotionDisconnectRo = z.infer<typeof notionDisconnectRoSchema>;

export const notionDisconnectVoSchema = z.object({
  disconnected: z.boolean(),
});

export type INotionDisconnectVo = z.infer<typeof notionDisconnectVoSchema>;

export const NOTION_DISCONNECT = '/admin/notion/disconnect';

export const NotionDisconnectRoute: RouteConfig = registerRoute({
  method: 'post',
  path: NOTION_DISCONNECT,
  description: 'Remove the stored Notion token for the requested space',
  request: {
    body: {
      content: {
        'application/json': {
          schema: notionDisconnectRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Token removed',
      content: {
        'application/json': {
          schema: notionDisconnectVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const notionDisconnect = async (input: INotionDisconnectRo) => {
  return axios.post<INotionDisconnectVo>(NOTION_DISCONNECT, input);
};
