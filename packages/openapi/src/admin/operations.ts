import { axios } from '../axios';
import type { IDataDbConnectionSummaryVo } from '../space/data-db';

export interface IAdminUser {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean | null;
  isSystem: boolean | null;
  deactivatedTime: string | null;
  deletedTime: string | null;
  createdTime: string;
  lastSignTime: string | null;
}

export interface IAdminSpace {
  id: string;
  name: string;
  createdBy: string;
  createdTime: string;
  autoJoin: boolean;
  baseCount: number;
  collaboratorCount: number;
}

export interface IAdminQuotaHit {
  id: string;
  spaceId: string | null;
  metric: string;
  attempted: number;
  cap: number;
  actorId: string | null;
  resource: string | null;
  createdTime: string;
}

export interface IAdminPagedResult<T> {
  list: T[];
  total: number;
  skip: number;
  take: number;
}

export const listAdminUsers = async (params?: { skip?: number; take?: number; search?: string }) =>
  axios.get<IAdminPagedResult<IAdminUser>>('/admin/users', { params });

export const updateAdminUser = async (
  userId: string,
  input: { active?: boolean; isAdmin?: boolean }
) => axios.patch<IAdminUser>(`/admin/users/${userId}`, input);

export interface IAdminPasswordReset {
  userId: string;
  resetPasswordUrl: string;
  expiresAt: string;
  emailSent: boolean;
}

export const createAdminPasswordReset = async (userId: string, input?: { sendEmail?: boolean }) =>
  axios.post<IAdminPasswordReset>(`/admin/users/${userId}/password-reset`, input ?? {});

export const restoreAdminUser = async (userId: string) =>
  axios.post<IAdminUser>(`/admin/users/${userId}/restore`);

export const deleteAdminUser = async (userId: string) =>
  axios.delete<{ id: string; deletedTime: string }>(`/admin/users/${userId}`, {
    data: { confirm: 'DELETE' },
  });

export const permanentlyDeleteAdminUser = async (userId: string) =>
  axios.delete<{ id: string; permanentDeleted: true }>(`/admin/users/${userId}/permanent`, {
    data: { confirm: 'DELETE' },
  });

export const listAdminSpaces = async (params?: { skip?: number; take?: number }) =>
  axios.get<IAdminPagedResult<IAdminSpace>>('/admin/spaces', { params });

export interface IAdminDataDbSpace {
  id: string;
  name: string;
  createdTime: string;
  dataDb: IDataDbConnectionSummaryVo;
}

export const listAdminDataDb = async (params?: { skip?: number; take?: number }) =>
  axios.get<IAdminPagedResult<IAdminDataDbSpace>>('/admin/data-db', { params });

export const retestAdminDataDb = async (spaceId: string) =>
  axios.post<IDataDbConnectionSummaryVo>(`/admin/data-db/${spaceId}/retest`);

export const updateAdminDataDb = async (spaceId: string, input: { url: string }) =>
  axios.patch<IDataDbConnectionSummaryVo>(`/admin/data-db/${spaceId}`, input);

export const updateAdminSpace = async (
  spaceId: string,
  input: { name?: string; autoJoin?: boolean }
) => axios.patch<IAdminSpace>(`/admin/spaces/${spaceId}`, input);

export const deleteAdminSpace = async (spaceId: string) =>
  axios.delete<{ id: string; deleted: true }>(`/admin/spaces/${spaceId}`);

export const listAdminQuotaHits = async (params?: { skip?: number; take?: number }) =>
  axios.get<IAdminPagedResult<IAdminQuotaHit>>('/admin/quota-dashboard', { params });

export interface IAdminTableQueryOpsOverview {
  enabled: boolean;
  summary: {
    observationWindowCount: number;
    requestCount: number;
    slowCount: number;
    timeoutCount: number;
    dbErrorCount: number;
    recommendationCount: number;
    openRecommendationCount: number;
    acceptedRecommendationCount: number;
    taskCount: number;
    runningTaskCount: number;
    failedTaskCount: number;
  } | null;
  hotTables: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
}

export const getAdminTableQueryOpsOverview = async (params?: {
  spaceId?: string;
  baseId?: string;
  tableId?: string;
  limit?: number;
}) => axios.get<IAdminTableQueryOpsOverview>('/admin/table-query-ops/overview', { params });

export const acceptAdminTableQueryOpsRecommendation = async (
  recommendationId: string,
  input: { baseId: string; kind?: string }
) =>
  axios.post<Record<string, unknown>>(
    `/admin/table-query-ops/recommendations/${recommendationId}/accept`,
    input
  );

export const dismissAdminTableQueryOpsRecommendation = async (
  recommendationId: string,
  input: { baseId: string }
) =>
  axios.post<Record<string, unknown>>(
    `/admin/table-query-ops/recommendations/${recommendationId}/dismiss`,
    input
  );

export const runAdminTableQueryOpsTask = async (
  taskId: string,
  input: { baseId: string; allowManualIndexExecution: boolean }
) => axios.post<Record<string, unknown>>(`/admin/table-query-ops/tasks/${taskId}/run`, input);

export interface IAdminAiGenerationQueueOverview {
  queue: { available: boolean; waiting: number | null; processing: number | null; reason: string };
  summary: {
    configuredFields: number;
    enabledFields: number;
    errorFields: number;
    lastHourRuns: number;
    byStatus: { ok: number; failed: number; rateLimited: number; skipped: number };
    tasks: {
      waiting: number;
      processing: number;
      completed: number;
      failed: number;
      canceled: number;
    };
  };
  fields: Array<Record<string, unknown>>;
  recentRuns: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
}

export const getAdminAiGenerationQueueOverview = async () =>
  axios.get<IAdminAiGenerationQueueOverview>('/admin/ai-generation-queue/overview');

export const listAdminAiGenerationTasks = async (params?: {
  status?: 'waiting' | 'processing' | 'completed' | 'failed' | 'canceled';
  spaceId?: string;
  take?: number;
}) => axios.get<Array<Record<string, unknown>>>('/admin/ai-generation-queue/tasks', { params });

export const cancelAdminAiGenerationTask = async (taskId: string) =>
  axios.post<Record<string, unknown>>(`/admin/ai-generation-queue/tasks/${taskId}/cancel`);
