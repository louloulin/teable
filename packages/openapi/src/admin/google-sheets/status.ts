/**
 * Google Sheets admin — status (T-15 Wave 10).
 *
 *   GET /api/admin/google-sheets/status/:spaceId
 *
 * Returns the connection state for a space: whether a token is
 * stored, when it expires, what scope it has, and which spreadsheet
 * was last bound to it. Tokens themselves are never returned.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../../axios';
import { registerRoute, urlBuilder } from '../../utils';
import { z } from '../../zod';

export const GET_GOOGLE_SHEETS_STATUS = '/admin/google-sheets/status/{spaceId}';

export const googleSheetsStatusVoSchema = z.object({
  connected: z.boolean(),
  spaceId: z.string(),
  expiresAt: z.number().optional(),
  scope: z.string().optional(),
  spreadsheetId: z.string().optional(),
  sheetName: z.string().optional(),
  storedAt: z.number().optional(),
});

export type IGoogleSheetsStatusVo = z.infer<typeof googleSheetsStatusVoSchema>;

export const GetGoogleSheetsStatusRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_GOOGLE_SHEETS_STATUS,
  description: 'Get Google Sheets connection status for the given space',
  request: {
    params: z.object({
      spaceId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Returns the connection state without exposing tokens',
      content: {
        'application/json': {
          schema: googleSheetsStatusVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const getGoogleSheetsStatus = async (spaceId: string) => {
  return axios.get<IGoogleSheetsStatusVo>(urlBuilder(GET_GOOGLE_SHEETS_STATUS, { spaceId }));
};
