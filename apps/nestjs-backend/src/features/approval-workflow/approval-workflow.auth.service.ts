import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  computeExpiresAt,
  computeProgress,
  hasAlreadyDecided,
  isApproverFor,
  isExpiredBy,
  isValidStrategy,
  validateCastInput,
  validateRequestInput,
  validateWorkflowInput,
} from './approval-workflow.service';
import type {
  ApprovalDecision,
  ApprovalStatus,
  ApprovalStrategy,
  ICastDecisionInput,
  ICreateRequestInput,
  ICreateWorkflowInput,
  IWorkflowProgress,
} from './approval-workflow.types';

@Injectable()
export class ApprovalWorkflowAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkflow(input: ICreateWorkflowInput) {
    validateWorkflowInput(input);
    const id = `aw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.approvalWorkflow.create({
      data: {
        id,
        baseId: input.baseId,
        tableId: input.tableId,
        name: input.name.trim(),
        strategy: input.strategy,
        approverIdsJson: JSON.stringify(input.approverIds),
        threshold: input.threshold ?? null,
        expiresInHours: input.expiresInHours ?? null,
      },
    });
    return toWorkflow(row);
  }

  async listWorkflows(baseId: string, tableId?: string) {
    const where: Record<string, unknown> = { baseId };
    if (tableId) where['tableId'] = tableId;
    const rows = await this.prisma.approvalWorkflow.findMany({ where });
    return rows.map(toWorkflow);
  }

  async getWorkflow(workflowId: string) {
    const row = await this.prisma.approvalWorkflow.findUnique({ where: { id: workflowId } });
    if (!row) throw new NotFoundException(`workflow not found: ${workflowId}`);
    return toWorkflow(row);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    const existing = await this.prisma.approvalWorkflow.findUnique({ where: { id: workflowId } });
    if (!existing) throw new NotFoundException(`workflow not found: ${workflowId}`);
    await this.prisma.approvalWorkflow.delete({ where: { id: workflowId } });
  }

  async createRequest(input: ICreateRequestInput) {
    validateRequestInput(input);
    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { id: input.workflowId },
    });
    if (!workflow) throw new NotFoundException(`workflow not found: ${input.workflowId}`);
    const wf = toWorkflow(workflow);
    const id = `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = wf.expiresInHours
      ? computeExpiresAt(new Date(), wf.expiresInHours)
      : undefined;
    const row = await this.prisma.approvalRequest.create({
      data: {
        id,
        baseId: input.baseId,
        tableId: input.tableId,
        recordId: input.recordId,
        workflowId: input.workflowId,
        requesterUserId: input.requesterUserId,
        status: 'pending',
        payloadJson: JSON.stringify(input.payload),
        approverIdsJson: JSON.stringify(wf.approverIds),
        expiresAt: expiresAt ?? null,
      },
    });
    return toRequest(row);
  }

  async getRequest(requestId: string) {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException(`request not found: ${requestId}`);
    return toRequest(row);
  }

  async listRequestsForRecord(recordId: string) {
    const rows = await this.prisma.approvalRequest.findMany({ where: { recordId } });
    return rows.map(toRequest);
  }

  async listRequestsForUser(userId: string, onlyPending: boolean) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: {
        ...(onlyPending ? { status: 'pending' } : {}),
      },
    });
    return rows
      .map(toRequest)
      .filter((r) => isApproverFor(r, userId) || r.requesterUserId === userId);
  }

  async castDecision(input: ICastDecisionInput) {
    validateCastInput(input);
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!request) throw new NotFoundException(`request not found: ${input.requestId}`);
    const req = toRequest(request);
    if (req.status !== 'pending') {
      throw new BadRequestException(`request not pending: ${req.status}`);
    }
    if (!isApproverFor(req, input.approverUserId)) {
      throw new BadRequestException(`user ${input.approverUserId} is not an approver`);
    }
    const existing = await this.prisma.approvalDecision.findMany({
      where: { requestId: input.requestId },
    });
    if (hasAlreadyDecided(existing, input.approverUserId)) {
      throw new BadRequestException('approver already voted');
    }
    const decisionId = `ad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await this.prisma.approvalDecision.create({
      data: {
        id: decisionId,
        requestId: input.requestId,
        approverUserId: input.approverUserId,
        decision: input.decision,
        comment: input.comment ?? null,
      },
    });
    return this.recomputeStatus(input.requestId);
  }

  async cancelRequest(requestId: string, requesterUserId: string) {
    const existing = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new NotFoundException(`request not found: ${requestId}`);
    const req = toRequest(existing);
    if (req.requesterUserId !== requesterUserId) {
      throw new BadRequestException('only the requester may cancel');
    }
    if (req.status !== 'pending') {
      throw new BadRequestException(`request not pending: ${req.status}`);
    }
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'cancelled', decidedAt: new Date() },
    });
    return this.getRequest(requestId);
  }

  async listDecisions(requestId: string) {
    const rows = await this.prisma.approvalDecision.findMany({ where: { requestId } });
    return rows.map(toDecision);
  }

  async progress(requestId: string, now: Date = new Date()): Promise<IWorkflowProgress> {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`request not found: ${requestId}`);
    const req = toRequest(request);
    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { id: req.workflowId },
    });
    if (!workflow) throw new NotFoundException(`workflow not found: ${req.workflowId}`);
    const wf = toWorkflow(workflow);
    const decisions = await this.prisma.approvalDecision.findMany({
      where: { requestId },
    });
    const progress = computeProgress(
      req,
      decisions.map(toDecision),
      wf.strategy,
      wf.threshold,
      now,
      req.expiresAt
    );
    // Persist terminal status if needed.
    if (progress.decided && req.status === 'pending') {
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: progress.status, decidedAt: now },
      });
    }
    return { ...progress, requestId };
  }

  async recomputeStatus(requestId: string): Promise<IWorkflowProgress> {
    return this.progress(requestId);
  }

  isValidStrategy = isValidStrategy;
  isExpiredBy = isExpiredBy;
}

function toWorkflow(r: {
  id: string;
  baseId: string;
  tableId: string;
  name: string;
  strategy: string;
  approverIdsJson: string;
  threshold: number | null;
  expiresInHours: number | null;
  createdTime: Date;
  updatedTime: Date;
}) {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    name: r.name,
    strategy: r.strategy as ApprovalStrategy,
    approverIds: JSON.parse(r.approverIdsJson) as string[],
    threshold: r.threshold ?? undefined,
    expiresInHours: r.expiresInHours ?? undefined,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toRequest(r: {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  workflowId: string;
  requesterUserId: string;
  status: string;
  payloadJson: string;
  approverIdsJson: string;
  expiresAt: Date | null;
  createdTime: Date;
  decidedAt: Date | null;
}) {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    recordId: r.recordId,
    workflowId: r.workflowId,
    requesterUserId: r.requesterUserId,
    status: r.status as ApprovalStatus,
    payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
    approverIds: JSON.parse(r.approverIdsJson) as string[],
    expiresAt: r.expiresAt ?? undefined,
    createdTime: r.createdTime,
    decidedAt: r.decidedAt ?? undefined,
  };
}

function toDecision(r: {
  id: string;
  requestId: string;
  approverUserId: string;
  decision: string;
  comment: string | null;
  createdTime: Date;
}) {
  return {
    id: r.id,
    requestId: r.requestId,
    approverUserId: r.approverUserId,
    decision: r.decision as ApprovalDecision,
    comment: r.comment ?? undefined,
    createdTime: r.createdTime,
  };
}
