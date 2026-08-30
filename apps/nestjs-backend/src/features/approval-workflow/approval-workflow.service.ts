/**
 * Approval workflow — Stage 46.
 *
 * Pure helpers: workflow validation, progress calculation, status
 * derivation, expiration check, decision-cast validation. DB-touching
 * work is delegated to ApprovalWorkflowAuthService.
 */

import type {
  ApprovalDecision,
  ApprovalStatus,
  ApprovalStrategy,
  ICastDecisionInput,
  ICreateRequestInput,
  ICreateWorkflowInput,
  IWorkflowProgress,
} from './approval-workflow.types';
import { DEFAULT_APPROVER_LIMIT } from './approval-workflow.types';

export function isValidStrategy(s: string): s is ApprovalStrategy {
  return s === 'any-one' || s === 'all' || s === 'majority' || s === 'sequential';
}

export function isValidStatus(s: string): s is ApprovalStatus {
  return (
    s === 'pending' || s === 'approved' || s === 'rejected' || s === 'cancelled' || s === 'expired'
  );
}

export function isValidDecision(d: string): d is ApprovalDecision {
  return d === 'approve' || d === 'reject' || d === 'abstain';
}

export function validateWorkflowInput(input: ICreateWorkflowInput): void {
  if (!isValidStrategy(input.strategy)) throw new Error(`invalid strategy: ${input.strategy}`);
  if (!input.baseId || !input.tableId) throw new Error('baseId and tableId required');
  if (!input.name || input.name.trim().length === 0) throw new Error('name required');
  if (!Array.isArray(input.approverIds) || input.approverIds.length === 0) {
    throw new Error('approverIds required');
  }
  if (input.approverIds.length > DEFAULT_APPROVER_LIMIT) {
    throw new Error(`too many approvers (max ${DEFAULT_APPROVER_LIMIT})`);
  }
  const unique = new Set(input.approverIds);
  if (unique.size !== input.approverIds.length) {
    throw new Error('duplicate approverIds not allowed');
  }
  if (
    input.threshold !== undefined &&
    (input.threshold < 1 || input.threshold > input.approverIds.length)
  ) {
    throw new Error('threshold must be 1..approverIds.length');
  }
  if (input.expiresInHours !== undefined && input.expiresInHours <= 0) {
    throw new Error('expiresInHours must be > 0');
  }
}

export function validateRequestInput(input: ICreateRequestInput): void {
  if (!input.baseId || !input.tableId || !input.recordId || !input.workflowId) {
    throw new Error('baseId/tableId/recordId/workflowId required');
  }
  if (!input.requesterUserId) throw new Error('requesterUserId required');
  if (typeof input.payload !== 'object' || input.payload === null || Array.isArray(input.payload)) {
    throw new Error('payload must be a plain object');
  }
}

export function validateCastInput(input: ICastDecisionInput): void {
  if (!isValidDecision(input.decision)) throw new Error(`invalid decision: ${input.decision}`);
  if (!input.requestId || !input.approverUserId) {
    throw new Error('requestId and approverUserId required');
  }
}

/**
 * Compute progress: how many approvals / rejections / abstains we have,
 * and the derived final status based on strategy. Returns `decided=true`
 * only when the strategy says the request is final.
 */
export function computeProgress(
  request: { status: ApprovalStatus; approverIds: string[] },
  decisions: ReadonlyArray<{ approverUserId: string; decision: ApprovalDecision }>,
  strategy: ApprovalStrategy,
  threshold?: number,
  now: Date = new Date(),
  expiresAt?: Date
): IWorkflowProgress {
  const approvals = decisions.filter((d) => d.decision === 'approve');
  const rejections = decisions.filter((d) => d.decision === 'reject');
  const abstains = decisions.filter((d) => d.decision === 'abstain');
  const voted = new Set(decisions.map((d) => d.approverUserId));
  const pending = request.approverIds.filter((u) => !voted.has(u));
  const total = request.approverIds.length;
  const isExpired = expiresAt ? now >= expiresAt : false;

  if (request.status === 'cancelled') {
    return cancelledProgress(approvals, rejections, abstains, pending);
  }
  if (isExpired && request.status === 'pending') {
    return expiredProgress(approvals, rejections, abstains, pending);
  }

  const outcome = evalStrategy(
    strategy,
    total,
    approvals.length,
    rejections.length,
    abstains.length,
    threshold
  );
  const status: ApprovalStatus = outcome.decided ? outcome.status : request.status;
  const remainingRequired = outcome.decided
    ? 0
    : computeRemainingRequired(strategy, total, approvals.length, threshold);

  return {
    requestId: '',
    status,
    approvalsCount: approvals.length,
    rejectionsCount: rejections.length,
    abstainsCount: abstains.length,
    pendingApproverIds: [...pending],
    remainingRequired,
    decided: outcome.decided,
  };
}

function cancelledProgress(
  approvals: ReadonlyArray<unknown>,
  rejections: ReadonlyArray<unknown>,
  abstains: ReadonlyArray<unknown>,
  pending: ReadonlyArray<string>
): IWorkflowProgress {
  return {
    requestId: '',
    status: 'cancelled',
    approvalsCount: approvals.length,
    rejectionsCount: rejections.length,
    abstainsCount: abstains.length,
    pendingApproverIds: [...pending],
    remainingRequired: 0,
    decided: true,
  };
}

function expiredProgress(
  approvals: ReadonlyArray<unknown>,
  rejections: ReadonlyArray<unknown>,
  abstains: ReadonlyArray<unknown>,
  pending: ReadonlyArray<string>
): IWorkflowProgress {
  return {
    requestId: '',
    status: 'expired',
    approvalsCount: approvals.length,
    rejectionsCount: rejections.length,
    abstainsCount: abstains.length,
    pendingApproverIds: [...pending],
    remainingRequired: 0,
    decided: true,
  };
}

function evalStrategy(
  strategy: ApprovalStrategy,
  total: number,
  approvals: number,
  rejections: number,
  abstains: number,
  threshold?: number
): { decided: boolean; status: ApprovalStatus } {
  switch (strategy) {
    case 'any-one':
      return evalAnyOne(approvals, rejections);
    case 'all':
      return evalAll(total, approvals, rejections);
    case 'majority':
      return evalMajority(total, approvals, rejections, threshold);
    case 'sequential':
      return evalSequential(total, approvals, rejections, abstains);
  }
}

function evalAnyOne(approvals: number, rejections: number) {
  if (approvals >= 1) return { decided: true, status: 'approved' as ApprovalStatus };
  if (rejections >= 1) return { decided: true, status: 'rejected' as ApprovalStatus };
  return { decided: false, status: 'pending' as ApprovalStatus };
}

function evalAll(total: number, approvals: number, rejections: number) {
  if (approvals >= total) return { decided: true, status: 'approved' as ApprovalStatus };
  if (rejections >= 1) return { decided: true, status: 'rejected' as ApprovalStatus };
  return { decided: false, status: 'pending' as ApprovalStatus };
}

function evalMajority(total: number, approvals: number, rejections: number, threshold?: number) {
  const required = threshold ?? Math.floor(total / 2) + 1;
  if (approvals >= required) return { decided: true, status: 'approved' as ApprovalStatus };
  if (rejections >= total - required + 1) {
    return { decided: true, status: 'rejected' as ApprovalStatus };
  }
  return { decided: false, status: 'pending' as ApprovalStatus };
}

function evalSequential(total: number, approvals: number, rejections: number, abstains: number) {
  if (rejections > 0) return { decided: true, status: 'rejected' as ApprovalStatus };
  if (approvals + abstains >= total) {
    return { decided: true, status: 'approved' as ApprovalStatus };
  }
  return { decided: false, status: 'pending' as ApprovalStatus };
}

function computeRemainingRequired(
  strategy: ApprovalStrategy,
  total: number,
  approvals: number,
  threshold?: number
): number {
  if (strategy === 'any-one') return Math.max(0, 1 - approvals);
  if (strategy === 'all') return Math.max(0, total - approvals);
  if (strategy === 'majority') {
    const required = threshold ?? Math.floor(total / 2) + 1;
    return Math.max(0, required - approvals);
  }
  return 0;
}

/** True if the user is in the approver list. */
export function isApproverFor(request: { approverIds: string[] }, userId: string): boolean {
  return request.approverIds.includes(userId);
}

/** True if the user has already cast a decision on this request. */
export function hasAlreadyDecided(
  decisions: ReadonlyArray<{ approverUserId: string }>,
  userId: string
): boolean {
  return decisions.some((d) => d.approverUserId === userId);
}

/** Compute expiresAt = now + expiresInHours. */
export function computeExpiresAt(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3600_000);
}

/** True if `now` is past expiresAt. */
export function isExpiredBy(expiresAt: Date | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  return now >= expiresAt;
}
