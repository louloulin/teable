/**
 * Google Sheets admin — authorize-url (T-15 Wave 10).
 *
 *   GET /api/admin/google-sheets/authorize-url
 *
 * Returns a Google consent URL the front end can open in a popup.
 * When the operator has not configured `GOOGLE_SHEETS_CLIENT_ID`
 * the server returns `configured: false` and an empty `url`, and
 * the client renders the "not configured" CTA instead of opening
 * the popup.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';
import { z } from '../../zod';

export const AUTHORIZE_GOOGLE_SHEETS_URL = '/admin/google-sheets/authorize-url';

export const authorizeUrlResponseVoSchema = z.object({
  url: z.string(),
  configured: z.boolean(),
});

export type IAuthorizeUrlResponseVo = z.infer<typeof authorizeUrlResponseVoSchema>;

export const GetAuthorizeUrlRoute: RouteConfig = registerRoute({
  method: 'get',
  path: AUTHORIZE_GOOGLE_SHEETS_URL,
  description: 'Build a Google consent URL for the Google Sheets OAuth flow',
  request: {
    query: z.object({
      state: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Returns the consent URL and a configured flag',
      content: {
        'application/json': {
          schema: authorizeUrlResponseVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const getGoogleSheetsAuthorizeUrl = async (state?: string) => {
  return axios.get<IAuthorizeUrlResponseVo>(AUTHORIZE_GOOGLE_SHEETS_URL, {
    params: state ? { state } : undefined,
  });
};
