import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { ApprovalWorkflowAuthService } from './approval-workflow.auth.service';
import { ApprovalWorkflowController } from './approval-workflow.controller';

/**
 * Round-28: Approval workflow NestJS module.
 *
 * Wires the existing ApprovalWorkflowAuthService (CRUD + decision +
 * progress logic, validation, status recompute) to the HTTP layer via
 * the new ApprovalWorkflowController. The pure helpers in
 * approval-workflow.service.ts (validateXxx, computeProgress, etc.)
 * are not exported — they are consumed exclusively by the auth service.
 *
 * Registers 3 controllers worth of endpoints:
 *   - Workflow CRUD: create / list / get / delete
 *   - Request lifecycle: create / get / cancel
 *   - Decision flow: cast / list / progress
 */
@Module({
  imports: [PrismaModule],
  controllers: [ApprovalWorkflowController],
  providers: [ApprovalWorkflowAuthService],
  exports: [ApprovalWorkflowAuthService],
})
export class ApprovalWorkflowModule {}
