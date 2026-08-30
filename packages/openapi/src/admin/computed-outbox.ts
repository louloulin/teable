import { axios } from '../axios';

export type ComputedOutboxOverview = {
  status: 'healthy' | 'degraded' | 'critical';
  reasons: string[];
  sampledAt: string;
  config: Record<string, unknown>;
  queue: {
    configured: boolean;
    reachable: boolean;
    workers: number | null;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    paused: number;
    prioritized: number;
    completed: number;
    recentCompleted: Array<Record<string, unknown>>;
    recentFailed: Array<Record<string, unknown>>;
    error?: string;
  };
  outbox: {
    duePending: number;
    scheduledPending: number;
    activeProcessing: number;
    staleProcessing: number;
    dead: number;
    oldestDueAgeMs: number;
    targetCount: number;
    unavailableTargetCount: number;
    storage: Array<Record<string, unknown>>;
    error?: string;
  };
  activity: Record<string, unknown>;
};

export type ComputedOutboxAnomalies = {
  sampledAt: string;
  total: number;
  groupTotal: number;
  unavailableTargetCount: number;
  groups: Array<{
    groupKey: string;
    kind: string;
    targetId: string;
    storage: string;
    baseId: string;
    seedTableId: string;
    lastError: string | null;
    count: number;
    latestOccurredAt: string;
    items: Array<{
      taskId: string;
      occurredAt: string;
      kind: string;
      lastError: string | null;
    }>;
  }>;
};

export const getAdminComputedOutboxOverview = async (force = true) =>
  axios.get<ComputedOutboxOverview>('/admin/computed-outbox/overview', { params: { force } });

export const listAdminComputedOutboxAnomalies = async (groupLimit = 30) =>
  axios.get<ComputedOutboxAnomalies>('/admin/computed-outbox/anomalies', {
    params: { groupLimit },
  });

export const recoverAdminComputedOutboxAnomaly = async (input: {
  targetId: string;
  taskId: string;
  kind: 'dead' | 'stale';
}) => axios.post('/admin/computed-outbox/anomalies/recover', input);
