/**
 * NestJS module — registers the orchestrator service + controller.
 *
 * The LLM client and prompt router are wired with `@Optional()` so the
 * module can be imported without those providers; tests pass plain providers,
 * production wires `CuppyPromptRouter` (T-13-02) + the existing `ai` LLM
 * provider.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentOrchestratorController } from './agent-orchestrator.controller';

@Module({
  controllers: [AgentOrchestratorController],
  providers: [AgentOrchestratorService],
  exports: [AgentOrchestratorService],
})
export class AgentOrchestratorModule {}
