import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v2CoreTokens, type ICommandBus } from '@teable/v2-core';
import {
  AcceptTableQueryRecommendationCommand,
  DismissTableQueryRecommendationCommand,
  RunTableQueryRemediationTaskCommand,
  type ExecutablePhase1RemediationKind,
} from '@teable/v2-table-query-ops';
import { AuditScope } from '../audit/audit-scope';
import { V2ContainerService } from '../v2/v2-container.service';
import { V2ExecutionContextFactory } from '../v2/v2-execution-context.factory';

type CommandResult = { snapshot(): Record<string, unknown> };

@Injectable()
export class AdminTableQueryOpsService {
  constructor(
    private readonly v2Container: V2ContainerService,
    private readonly contextFactory: V2ExecutionContextFactory,
    private readonly audit: AuditScope
  ) {}

  async acceptRecommendation(input: {
    recommendationId: string;
    baseId: string;
    kind?: ExecutablePhase1RemediationKind;
  }) {
    const result = await this.execute(
      input.baseId,
      new AcceptTableQueryRecommendationCommand(input.recommendationId, input.kind)
    );
    await this.audit.emitAtomic({
      action: 'admin.table_query_ops.recommendation.accept',
      resourceId: input.recommendationId,
      payload: { baseId: input.baseId, kind: input.kind },
    });
    return result;
  }

  async dismissRecommendation(input: { recommendationId: string; baseId: string }) {
    const result = await this.execute(
      input.baseId,
      new DismissTableQueryRecommendationCommand(input.recommendationId)
    );
    await this.audit.emitAtomic({
      action: 'admin.table_query_ops.recommendation.dismiss',
      resourceId: input.recommendationId,
      payload: { baseId: input.baseId },
    });
    return result;
  }

  async runTask(input: { taskId: string; baseId: string; allowManualIndexExecution: boolean }) {
    const result = await this.execute(
      input.baseId,
      new RunTableQueryRemediationTaskCommand(
        input.taskId,
        input.allowManualIndexExecution,
        'admin-manual'
      )
    );
    await this.audit.emitAtomic({
      action: 'admin.table_query_ops.task.run',
      resourceId: input.taskId,
      payload: {
        baseId: input.baseId,
        allowManualIndexExecution: input.allowManualIndexExecution,
      },
    });
    return result;
  }

  private async execute(baseId: string, command: Parameters<ICommandBus['execute']>[1]) {
    let container;
    try {
      container = await this.v2Container.getContainerForBase(baseId);
    } catch {
      throw new NotFoundException('Base not found or V2 runtime is unavailable');
    }
    const commandBus = container.resolve<ICommandBus>(v2CoreTokens.commandBus);
    const context = await this.contextFactory.createContext(container);
    const result = await commandBus.execute(context, command as never);
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }
    return (result.value as unknown as CommandResult).snapshot();
  }
}
