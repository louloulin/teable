/**
 * Client for the workspace-mirror controller
 * (`apps/nestjs-backend/src/features/workspace-mirror/workspace-mirror.controller.ts`).
 *
 * Uses the shared `axios` instance from `@teable/openapi`, whose baseURL is
 * already `/api` — so paths here are relative to that. Types come from
 * `@teable/openapi` too; the mirror shapes are defined once there and
 * re-exported by the backend feature folder.
 */

import { axios } from '@teable/openapi';
import type {
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
} from '@teable/openapi';

const BASE = '/workspace-mirror/configs';

/** Query keys, namespaced so they never collide with `ReactQueryKeys`. */
export const mirrorQueryKeys = {
  configs: () => ['workspace-mirror', 'configs'] as const,
  lag: (baseId: string) => ['workspace-mirror', 'lag', baseId] as const,
  status: (baseId: string) => ['workspace-mirror', 'status', baseId] as const,
  logs: (baseId: string, since?: string) =>
    ['workspace-mirror', 'logs', baseId, since ?? null] as const,
};

export const listMirrorConfigs = async (): Promise<IMirrorConfig[]> => {
  const res = await axios.get<IMirrorConfig[]>(BASE);
  return res.data;
};

export const createMirrorConfig = async (config: IMirrorConfig): Promise<IMirrorConfig> => {
  const res = await axios.post<IMirrorConfig>(BASE, config);
  return res.data;
};

export const getMirrorLag = async (baseId: string): Promise<IMirrorLag> => {
  const res = await axios.get<IMirrorLag>(`${BASE}/${baseId}/lag`);
  return res.data;
};

export const getMirrorStatus = async (baseId: string): Promise<IMirrorQueryResult> => {
  const res = await axios.get<IMirrorQueryResult>(`${BASE}/${baseId}/status`);
  return res.data;
};

export const pauseMirror = async (baseId: string): Promise<IMirrorConfig> => {
  const res = await axios.post<IMirrorConfig>(`${BASE}/${baseId}/pause`);
  return res.data;
};

export const resumeMirror = async (baseId: string): Promise<IMirrorConfig> => {
  const res = await axios.post<IMirrorConfig>(`${BASE}/${baseId}/resume`);
  return res.data;
};

export const getMirrorLogs = async (
  baseId: string,
  since?: string
): Promise<IMirrorLogRecord[]> => {
  const res = await axios.get<IMirrorLogRecord[]>(`${BASE}/${baseId}/logs`, {
    params: since ? { since } : undefined,
  });
  return res.data;
};
