/**
 * Notion OAuth admin endpoint — exchanges an authorization code returned by
 * Notion for an access token and stores the resulting grant in the
 * `notion_tokens` setting row, scoped by spaceId. The encryption envelope
 * matches the im-bridge service (AES-256-GCM, base64(iv).authTag.ciphertext)
 * so we don't need a new key-management surface.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const notionConnectRoSchema = z.object({
  code: z.string().min(1).max(2048),
  spaceId: z.string().min(1),
});

export type INotionConnectRo = z.infer<typeof notionConnectRoSchema>;

export const notionConnectVoSchema = z.object({
  connected: z.boolean(),
  workspaceName: z.string(),
  workspaceId: z.string().optional(),
  botId: z.string().optional(),
});

export type INotionConnectVo = z.infer<typeof notionConnectVoSchema>;

export const NOTION_CONNECT = '/admin/notion/connect';

export const NotionConnectRoute: RouteConfig = registerRoute({
  method: 'post',
  path: NOTION_CONNECT,
  description: 'Exchange a Notion OAuth authorization code and store the resulting grant',
  request: {
    body: {
      content: {
        'application/json': {
          schema: notionConnectRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Notion OAuth connection stored for the requested space',
      content: {
        'application/json': {
          schema: notionConnectVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const notionConnect = async (input: INotionConnectRo) => {
  return axios.post<INotionConnectVo>(NOTION_CONNECT, input);
};
