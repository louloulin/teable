/**
 * Approval workflow — Stage 46.
 *
 * A `ApprovalWorkflow` describes a reusable approval policy
 * (which fields, which approvers, how many must sign).
 * An `ApprovalRequest` is one instance of a workflow applied to
 * one record. An `ApprovalDecision` records each approver's vote.
 */

export type ApprovalStrategy = 'any-one' | 'all' | 'majority' | 'sequential';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export type ApprovalDecision = 'approve' | 'reject' | 'abstain';

export interface IApprovalWorkflow {
  id: string;
  baseId: string;
  tableId: string;
  name: string;
  /// Strategy used to count approvals.
  strategy: ApprovalStrategy;
  /// Required approver user IDs in order (for sequential).
  approverIds: string[];
  /// For majority: how many approvers must agree (overrides strategy otherwise).
  threshold?: number;
  /// Hours after which a pending request auto-expires.
  expiresInHours?: number;
  createdTime: Date;
  updatedTime: Date;
}

export interface IApprovalRequest {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  workflowId: string;
  requesterUserId: string;
  status: ApprovalStatus;
  /// Snapshot of the record fields being approved.
  payload: Record<string, unknown>;
  /// Snapshot of approvers resolved at request time (handles order preserved).
  approverIds: string[];
  expiresAt?: Date;
  createdTime: Date;
  decidedAt?: Date;
}

export interface IApprovalDecisionRow {
  id: string;
  requestId: string;
  approverUserId: string;
  decision: ApprovalDecision;
  comment?: string;
  createdTime: Date;
}

export interface ICreateWorkflowInput {
  baseId: string;
  tableId: string;
  name: string;
  strategy: ApprovalStrategy;
  approverIds: string[];
  threshold?: number;
  expiresInHours?: number;
}

export interface ICreateRequestInput {
  baseId: string;
  tableId: string;
  recordId: string;
  workflowId: string;
  requesterUserId: string;
  payload: Record<string, unknown>;
}

export interface ICastDecisionInput {
  requestId: string;
  approverUserId: string;
  decision: ApprovalDecision;
  comment?: string;
}

export interface IWorkflowProgress {
  requestId: string;
  status: ApprovalStatus;
  approvalsCount: number;
  rejectionsCount: number;
  abstainsCount: number;
  pendingApproverIds: string[];
  remainingRequired: number;
  decided: boolean;
}

export const DEFAULT_APPROVER_LIMIT = 20;
export const DEFAULT_EXPIRES_HOURS = 168;
