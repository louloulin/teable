/**
 * SCIM 2.0 admin endpoint definitions.
 *
 * Mirrors the SCIM/RFC 7644 resource shape enough for the admin UI to render
 * synced users/groups, while staying independent of the SCIM controller's
 * transport-level shape (which is required to return SCIM schemas with
 * `schemas`, `Resources`, `totalResults`, etc. — those live in the backend
 * controller, not in the admin openapi).
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const scimUserVoSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable().optional(),
  userName: z.string(),
  displayName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  active: z.boolean().optional(),
  // Optional SCIM schemas — populated when the controller projects a SCIM User resource.
  schemas: z.array(z.string()).optional(),
});

export type IScimUserVo = z.infer<typeof scimUserVoSchema>;

export const scimGroupVoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  // Email members are flattened strings in the admin listing to keep the table
  // payload light — the SCIM controller keeps the full member[] for actual
  // SCIM GET/PUT operations.
  members: z.array(z.string()).optional(),
  schemas: z.array(z.string()).optional(),
});

export type IScimGroupVo = z.infer<typeof scimGroupVoSchema>;

export const scimConfigSchema = z.object({
  enabled: z.boolean().default(true),
  endpoint: z.string(),
  // Token is exposed only on rotation. `hasToken` indicates whether a token
  // is currently set without revealing it.
  hasToken: z.boolean(),
  createdTime: z.string().optional(),
  lastRotatedTime: z.string().optional(),
  // User/sync counters useful for the admin overview.
  userCount: z.number().optional(),
  groupCount: z.number().optional(),
});

export type IScimConfigVo = z.infer<typeof scimConfigSchema>;

export const scimConfigWithTokenSchema = scimConfigSchema.extend({
  token: z.string(),
});

export type IScimConfigWithTokenVo = z.infer<typeof scimConfigWithTokenSchema>;

export const scimListUsersVoSchema = z.object({
  total: z.number(),
  users: z.array(scimUserVoSchema),
});

export type IScimListUsersVo = z.infer<typeof scimListUsersVoSchema>;

export const scimListGroupsVoSchema = z.object({
  total: z.number(),
  groups: z.array(scimGroupVoSchema),
});

export type IScimListGroupsVo = z.infer<typeof scimListGroupsVoSchema>;

export const GET_SCIM_CONFIG = '/admin/scim/config';

export const GetScimConfigRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_SCIM_CONFIG,
  description: 'Get the SCIM push provisioning configuration',
  request: {},
  responses: {
    200: {
      description: 'Returns the SCIM config, including endpoint and token status.',
      content: {
        'application/json': {
          schema: scimConfigSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const getScimConfig = async () => {
  return axios.get<IScimConfigVo>(GET_SCIM_CONFIG);
};

export const ROTATE_SCIM_TOKEN = '/admin/scim/config/rotate';

export const RotateScimTokenRoute: RouteConfig = registerRoute({
  method: 'post',
  path: ROTATE_SCIM_TOKEN,
  description: 'Rotate the SCIM bearer token',
  request: {},
  responses: {
    200: {
      description: 'Returns the new SCIM config with the freshly-issued bearer token.',
      content: {
        'application/json': {
          schema: scimConfigWithTokenSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const rotateScimToken = async () => {
  return axios.post<IScimConfigWithTokenVo>(ROTATE_SCIM_TOKEN);
};

export const LIST_SCIM_USERS = '/admin/scim/users';

export const ListScimUsersRoute: RouteConfig = registerRoute({
  method: 'get',
  path: LIST_SCIM_USERS,
  description: 'List users previously synced via SCIM push provisioning',
  request: {},
  responses: {
    200: {
      description: 'Returns the synced user list.',
      content: {
        'application/json': {
          schema: scimListUsersVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const listScimUsers = async () => {
  return axios.get<IScimListUsersVo>(LIST_SCIM_USERS);
};

export const LIST_SCIM_GROUPS = '/admin/scim/groups';

export const ListScimGroupsRoute: RouteConfig = registerRoute({
  method: 'get',
  path: LIST_SCIM_GROUPS,
  description: 'List groups previously synced via SCIM push provisioning',
  request: {},
  responses: {
    200: {
      description: 'Returns the synced group list.',
      content: {
        'application/json': {
          schema: scimListGroupsVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const listScimGroups = async () => {
  return axios.get<IScimListGroupsVo>(LIST_SCIM_GROUPS);
};
