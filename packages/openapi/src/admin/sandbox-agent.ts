import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../axios';
import { registerRoute } from '../utils';
import { sandboxConfigSchema, type ISandboxConfig } from './setting/update';

export const sandboxRuntimeStatusSchema = z.object({
  configured: z.boolean(),
  reachable: z.boolean(),
  provider: z.string().nullable(),
  error: z.string().nullable(),
});

export const sandboxAgentConfigVoSchema = z.object({
  settings: sandboxConfigSchema,
  runtime: sandboxRuntimeStatusSchema,
});
export type ISandboxAgentConfigVo = z.infer<typeof sandboxAgentConfigVoSchema>;

export const sandboxSessionSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const sandboxSessionsVoSchema = z.object({
  runtime: sandboxRuntimeStatusSchema,
  sessions: z.array(sandboxSessionSchema),
});
export type ISandboxSessionsVo = z.infer<typeof sandboxSessionsVoSchema>;

export const SANDBOX_AGENT_CONFIG = '/admin/sandbox-agent/config';
export const SANDBOX_AGENT_SESSIONS = '/admin/sandbox-agent/sessions';

export const GetSandboxAgentConfigRoute: RouteConfig = registerRoute({
  method: 'get',
  path: SANDBOX_AGENT_CONFIG,
  description: 'Get Sandbox Agent limits and runtime connectivity status',
  request: {},
  responses: { 200: { description: 'Sandbox Agent configuration and status' } },
  tags: ['admin'],
});

export const getSandboxAgentConfig = () =>
  axios.get<ISandboxAgentConfigVo>(SANDBOX_AGENT_CONFIG);

export const updateSandboxAgentConfig = (settings: ISandboxConfig) =>
  axios.patch<ISandboxAgentConfigVo>(SANDBOX_AGENT_CONFIG, settings);

export const ListSandboxAgentSessionsRoute: RouteConfig = registerRoute({
  method: 'get',
  path: SANDBOX_AGENT_SESSIONS,
  description: 'List active Sandbox Agent sessions from the runtime plane',
  request: {},
  responses: { 200: { description: 'Sandbox sessions and runtime status' } },
  tags: ['admin'],
});

export const listSandboxAgentSessions = () =>
  axios.get<ISandboxSessionsVo>(SANDBOX_AGENT_SESSIONS);

export const terminateSandboxAgentSession = (sessionId: string) =>
  axios.delete(`${SANDBOX_AGENT_SESSIONS}/${encodeURIComponent(sessionId)}`);
