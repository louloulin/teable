import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const SET_TEAMS_CONFIG = '/admin/im-bridge/teams/config';
export const GET_TEAMS_CONFIG = (spaceId: string) =>
  `/admin/im-bridge/teams/config/${encodeURIComponent(spaceId)}` as const;
export const DELETE_TEAMS_CONFIG = (spaceId: string) =>
  `/admin/im-bridge/teams/config/${encodeURIComponent(spaceId)}` as const;
export const TEST_TEAMS_MESSAGE = '/admin/im-bridge/teams/config/test';

/**
 * Teams incoming-webhook URL must be HTTPS and on the office.com domain.
 * `TeamsAdapter.validateConfig` is the source of truth; the openapi
 * schema here mirrors its accepted shape so clients can lint before
 * sending.
 */
export const teamsWebhookUrlSchema = z
  .string()
  .min(1)
  .refine((url) => url.startsWith('https://'), {
    message: 'webhookUrl must use https',
  });

export const setTeamsConfigRoSchema = z.object({
  spaceId: z.string().min(1),
  webhookUrl: teamsWebhookUrlSchema,
});
export type ISetTeamsConfigRo = z.infer<typeof setTeamsConfigRoSchema>;

export const setTeamsConfigVoSchema = z.object({
  ok: z.literal(true),
  /**
   * Masked webhook URL — only the last 8 characters are visible. This
   * lets the admin UI confirm the connector URL was stored without
   * exposing the secret in the response.
   */
  masked: z.string(),
});
export type ISetTeamsConfigVo = z.infer<typeof setTeamsConfigVoSchema>;

export const getTeamsConfigVoSchema = z.object({
  configured: z.boolean(),
  webhookUrl: z.string().optional(),
});
export type IGetTeamsConfigVo = z.infer<typeof getTeamsConfigVoSchema>;

export const deleteTeamsConfigVoSchema = z.object({
  ok: z.literal(true),
  deleted: z.boolean(),
});
export type IDeleteTeamsConfigVo = z.infer<typeof deleteTeamsConfigVoSchema>;

export const testTeamsMessageRoSchema = z.object({
  spaceId: z.string().min(1),
  /** Optional override; when omitted the configured webhook for the space is used. */
  webhookUrl: teamsWebhookUrlSchema.optional(),
  text: z.string().min(1),
  title: z.string().optional(),
});
export type ITestTeamsMessageRo = z.infer<typeof testTeamsMessageRoSchema>;

export const testTeamsMessageVoSchema = z.union([
  z.object({ ok: z.literal(true), status: z.number() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ITestTeamsMessageVo = z.infer<typeof testTeamsMessageVoSchema>;

export const SetTeamsConfigRoute: RouteConfig = registerRoute({
  method: 'post',
  path: SET_TEAMS_CONFIG,
  description: 'Store the Microsoft Teams Incoming Webhook URL for a space.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: setTeamsConfigRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Configuration stored.',
      content: {
        'application/json': {
          schema: setTeamsConfigVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'im-bridge'],
});

export const setTeamsConfig = async (ro: ISetTeamsConfigRo) => {
  return axios.post<ISetTeamsConfigVo>(SET_TEAMS_CONFIG, ro);
};

export const GetTeamsConfigRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_TEAMS_CONFIG(':spaceId'),
  description: 'Get the masked Microsoft Teams webhook URL for a space.',
  request: {},
  responses: {
    200: {
      description: 'Returns the masked webhook URL.',
      content: {
        'application/json': {
          schema: getTeamsConfigVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'im-bridge'],
});

export const getTeamsConfig = async (spaceId: string) => {
  return axios.get<IGetTeamsConfigVo>(GET_TEAMS_CONFIG(spaceId));
};

export const DeleteTeamsConfigRoute: RouteConfig = registerRoute({
  method: 'delete',
  path: DELETE_TEAMS_CONFIG(':spaceId'),
  description: 'Delete the Microsoft Teams webhook URL for a space.',
  request: {},
  responses: {
    200: {
      description: 'Configuration cleared.',
      content: {
        'application/json': {
          schema: deleteTeamsConfigVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'im-bridge'],
});

export const deleteTeamsConfig = async (spaceId: string) => {
  return axios.delete<IDeleteTeamsConfigVo>(DELETE_TEAMS_CONFIG(spaceId));
};

export const TestTeamsMessageRoute: RouteConfig = registerRoute({
  method: 'post',
  path: TEST_TEAMS_MESSAGE,
  description:
    'Send a one-shot test message through the configured (or supplied) Microsoft Teams webhook URL.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: testTeamsMessageRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Test message dispatched. ok=false indicates an upstream failure.',
      content: {
        'application/json': {
          schema: testTeamsMessageVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'im-bridge'],
});

export const testTeamsMessage = async (ro: ITestTeamsMessageRo) => {
  return axios.post<ITestTeamsMessageVo>(TEST_TEAMS_MESSAGE, ro);
};
