/**
 * Google Sheets admin — connect (T-15 Wave 10).
 *
 *   POST /api/admin/google-sheets/connect
 *
 * Exchanges a Google OAuth `code` for access + refresh tokens and
 * persists them (encrypted) under `googleSheets.<spaceId>` in the
 * setting store.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';
import { z } from '../../zod';

export const CONNECT_GOOGLE_SHEETS = '/admin/google-sheets/connect';

export const googleSheetsConnectRoSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  spaceId: z.string().min(1),
});

export type IGoogleSheetsConnectRo = z.infer<typeof googleSheetsConnectRoSchema>;

export const googleSheetsConnectResponseVoSchema = z.object({
  connected: z.literal(true),
  spaceId: z.string(),
  expiresAt: z.number(),
});

export type IGoogleSheetsConnectResponseVo = z.infer<typeof googleSheetsConnectResponseVoSchema>;

export const ConnectGoogleSheetsRoute: RouteConfig = registerRoute({
  method: 'post',
  path: CONNECT_GOOGLE_SHEETS,
  description: 'Exchange a Google OAuth code and store tokens for the given space',
  request: {
    body: {
      content: {
        'application/json': {
          schema: googleSheetsConnectRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Tokens stored; returns connected flag and the access-token expiry epoch',
      content: {
        'application/json': {
          schema: googleSheetsConnectResponseVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const connectGoogleSheets = async (ro: IGoogleSheetsConnectRo) => {
  return axios.post<IGoogleSheetsConnectResponseVo>(CONNECT_GOOGLE_SHEETS, ro);
};
