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
  if (input.threshold !== undefined) {
    if (input.threshold < 1 || input.threshold > input.approverIds.length) {
      throw new Error('threshold must be 1..approverIds.length');
    }
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
  const decidedUserIds = decisions.map((d) => d.approverUserId);
  const isExpired = expiresAt ? now >= expiresAt : false;
  let status: ApprovalStatus = request.status;
  let decided = false;

  if (request.status === 'cancelled') {
    return {
      requestId: '',
      status: 'cancelled',
      approvalsCount: approvals.length,
      rejectionsCount: rejections.length,
      abstainsCount: abstains.length,
      pendingApproverIds: pending,
      remainingRequired: 0,
      decided: true,
    };
  }
  if (isExpired && request.status === 'pending') {
    status = 'expired';
    decided = true;
  } else if (strategy === 'any-one') {
    if (approvals.length >= 1) {
      status = 'approved';
      decided = true;
    } else if (rejections.length >= 1) {
      status = 'rejected';
      decided = true;
    }
  } else if (strategy === 'all') {
    if (approvals.length >= total) {
      status = 'approved';
      decided = true;
    } else if (rejections.length >= 1) {
      status = 'rejected';
      decided = true;
    }
  } else if (strategy === 'majority') {
    const required = threshold ?? Math.floor(total / 2) + 1;
    if (approvals.length >= required) {
      status = 'approved';
      decided = true;
    } else if (rejections.length >= total - required + 1) {
      // The request cannot reach majority.
      status = 'rejected';
      decided = true;
    }
  } else if (strategy === 'sequential') {
    // Walk approvers in order; first non-approve ends the chain.
    const reached = approvals.length + abstains.length;
    if (rejections.length > 0) {
      status = 'rejected';
      decided = true;
    } else if (reached >= total) {
      status = 'approved';
      decided = true;
    }
  }

  // computed remaining required
  const remainingRequired =
    strategy === 'any-one'
      ? Math.max(0, 1 - approvals.length)
      : strategy === 'all'
        ? Math.max(0, total - approvals.length)
        : strategy === 'majority'
          ? Math.max(0, (threshold ?? Math.floor(total / 2) + 1) - approvals.length)
          : 0;

  return {
    requestId: '',
    status,
    approvalsCount: approvals.length,
    rejectionsCount: rejections.length,
    abstainsCount: abstains.length,
    pendingApproverIds: pending,
    remainingRequired,
    decided,
  };
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
