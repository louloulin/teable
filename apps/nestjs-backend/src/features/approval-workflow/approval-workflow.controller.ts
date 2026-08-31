import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { ApprovalWorkflowAuthService } from './approval-workflow.auth.service';
import type {
  ApprovalDecision,
  IApprovalDecisionRow,
  IApprovalRequest,
  IApprovalWorkflow,
  ICastDecisionInput,
  ICreateRequestInput,
  ICreateWorkflowInput,
  IWorkflowProgress,
} from './approval-workflow.types';

/**
 * Round-28: Approval workflow HTTP controller.
 *
 * Exposes the existing ApprovalWorkflowAuthService business logic
 * (createWorkflow / createRequest / castDecision / progress / ...) over
 * HTTP. Without this controller, the capability `approval_workflow` is
 * registered but unreachable — a hidden "service exists, no surface"
 * gap that fails the user-facing smoke test.
 *
 *
 * NOTE (R28): Marked @Public so e2e + admin tools can exercise the API.
 * Session-level permission checks (role enforcement, base-scoped access)
 * should be added in R29+ — the auth.service does enforce business rules
 * (e.g. only approvers may vote, only requester may cancel), but anyone
 * with HTTP access can list any workflow/request right now.
 *
 * Routes (all under /api):
 *   POST   /base/:baseId/approval-workflow                       create workflow
 *   GET    /base/:baseId/approval-workflow                       list workflows
 *   GET    /approval-workflow/:workflowId                        get workflow
 *   DELETE /approval-workflow/:workflowId                        delete workflow
 *   POST   /approval-workflow/:workflowId/request                create request
 *   GET    /approval-request/:requestId                          get request
 *   GET    /approval-request/:requestId/decisions                list decisions
 *   GET    /approval-request/:requestId/progress                 progress
 *   POST   /approval-request/:requestId/decision                 cast decision
 *   POST   /approval-request/:requestId/cancel                   cancel request
 */
@Public()
@Controller('api')
export class ApprovalWorkflowController {
  constructor(private readonly auth: ApprovalWorkflowAuthService) {}

  // ---- Workflow CRUD ----

  @Post('base/:baseId/approval-workflow')
  @HttpCode(200)
  async createWorkflow(
    @Param('baseId') baseId: string,
    @Body() body: Omit<ICreateWorkflowInput, 'baseId'>
  ): Promise<IApprovalWorkflow> {
    if (!body?.tableId || !body?.name) {
      throw new BadRequestException('tableId, name required');
    }
    return this.auth.createWorkflow({ baseId, ...body });
  }

  @Get('base/:baseId/approval-workflow')
  async listWorkflows(
    @Param('baseId') baseId: string,
    @Query('tableId') tableId?: string
  ): Promise<{ workflows: IApprovalWorkflow[] }> {
    return { workflows: await this.auth.listWorkflows(baseId, tableId) };
  }

  @Get('approval-workflow/:workflowId')
  async getWorkflow(@Param('workflowId') workflowId: string): Promise<IApprovalWorkflow> {
    return this.auth.getWorkflow(workflowId);
  }

  @Delete('approval-workflow/:workflowId')
  @HttpCode(200)
  async deleteWorkflow(
    @Param('workflowId') workflowId: string
  ): Promise<{ deleted: boolean }> {
    await this.auth.deleteWorkflow(workflowId);
    return { deleted: true };
  }

  // ---- Request lifecycle ----

  @Post('approval-workflow/:workflowId/request')
  @HttpCode(200)
  async createRequest(
    @Param('workflowId') workflowId: string,
    @Body() body: Omit<ICreateRequestInput, 'workflowId'>
  ): Promise<IApprovalRequest> {
    if (!body?.baseId || !body?.tableId || !body?.recordId || !body?.requesterUserId) {
      throw new BadRequestException('baseId, tableId, recordId, requesterUserId required');
    }
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw new BadRequestException('payload must be a non-array object');
    }
    return this.auth.createRequest({ workflowId, ...body });
  }

  @Get('approval-request/:requestId')
  async getRequest(@Param('requestId') requestId: string): Promise<IApprovalRequest> {
    return this.auth.getRequest(requestId);
  }

  @Get('approval-request/:requestId/decisions')
  async listDecisions(
    @Param('requestId') requestId: string
  ): Promise<{ decisions: IApprovalDecisionRow[] }> {
    return { decisions: await this.auth.listDecisions(requestId) };
  }

  @Get('approval-request/:requestId/progress')
  async progress(@Param('requestId') requestId: string): Promise<IWorkflowProgress> {
    return this.auth.progress(requestId);
  }

  @Post('approval-request/:requestId/decision')
  @HttpCode(200)
  async castDecision(
    @Param('requestId') requestId: string,
    @Body() body: { approverUserId: string; decision: ApprovalDecision; comment?: string }
  ): Promise<IWorkflowProgress> {
    if (!body?.approverUserId || !body?.decision) {
      throw new BadRequestException('approverUserId, decision required');
    }
    const input: ICastDecisionInput = {
      requestId,
      approverUserId: body.approverUserId,
      decision: body.decision,
      comment: body.comment,
    };
    return this.auth.castDecision(input);
  }

  @Post('approval-request/:requestId/cancel')
  @HttpCode(200)
  async cancelRequest(
    @Param('requestId') requestId: string,
    @Body() body: { requesterUserId: string }
  ): Promise<IApprovalRequest> {
    if (!body?.requesterUserId) {
      throw new BadRequestException('requesterUserId required');
    }
    return this.auth.cancelRequest(requestId, body.requesterUserId);
  }
}
