/**
 * Google Sheets admin — disconnect (T-15 Wave 10).
 *
 *   POST   /api/admin/google-sheets/disconnect/:spaceId
 *   DELETE /api/admin/google-sheets/disconnect/:spaceId
 *
 * Both verbs clear the stored tokens for the given space. POST
 * keeps backward compatibility with the existing callers; DELETE
 * matches REST convention for "remove a resource" so future
 * tooling (curl, SDKs, IdPs) can use the canonical verb.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../../axios';
import { registerRoute, urlBuilder } from '../../utils';
import { z } from '../../zod';

export const DISCONNECT_GOOGLE_SHEETS = '/admin/google-sheets/disconnect/{spaceId}';

export const googleSheetsDisconnectVoSchema = z.object({
  disconnected: z.literal(true),
  spaceId: z.string(),
});

export type IGoogleSheetsDisconnectVo = z.infer<typeof googleSheetsDisconnectVoSchema>;

const requestParams = z.object({
  spaceId: z.string(),
});

export const PostDisconnectGoogleSheetsRoute: RouteConfig = registerRoute({
  method: 'post',
  path: DISCONNECT_GOOGLE_SHEETS,
  description: 'Clear the stored Google Sheets tokens for the given space (POST alias)',
  request: {
    params: requestParams,
  },
  responses: {
    200: {
      description: 'Tokens cleared; returns a disconnected flag and the spaceId',
      content: {
        'application/json': {
          schema: googleSheetsDisconnectVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const DeleteDisconnectGoogleSheetsRoute: RouteConfig = registerRoute({
  method: 'delete',
  path: DISCONNECT_GOOGLE_SHEETS,
  description: 'Clear the stored Google Sheets tokens for the given space (REST DELETE)',
  request: {
    params: requestParams,
  },
  responses: {
    200: {
      description: 'Tokens cleared; returns a disconnected flag and the spaceId',
      content: {
        'application/json': {
          schema: googleSheetsDisconnectVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const postDisconnectGoogleSheets = async (spaceId: string) => {
  return axios.post<IGoogleSheetsDisconnectVo>(urlBuilder(DISCONNECT_GOOGLE_SHEETS, { spaceId }));
};

export const disconnectGoogleSheets = async (spaceId: string) => {
  return axios.delete<IGoogleSheetsDisconnectVo>(urlBuilder(DISCONNECT_GOOGLE_SHEETS, { spaceId }));
};
