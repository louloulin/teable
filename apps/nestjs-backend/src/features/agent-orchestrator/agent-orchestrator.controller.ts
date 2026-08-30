/**
 * Admin HTTP surface for the agent orchestrator.
 *
 * `GET /api/admin/agent/conversations/:id` — inspect a conversation's
 * persisted state for debugging / support.
 *
 * `POST /api/admin/agent/conversations/:id/reset` — wipe a conversation's
 * scratchpad + history without touching other tenants.  Useful when an end-
 * user reports the bot has gone off the rails.
 *
 * `GET /api/admin/agent/stats` — aggregated counts across all conversations
 * the orchestrator knows about, used by the `eval-harness` (T-13-04) and the
 * `ai-cost-forecaster` (T-13-05).
 *
 * License: AGPL-3.0
 */

import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AgentOrchestratorService } from './agent-orchestrator.service';

// AI admin-panel capability gate — matches the pattern used by
// `admin-open-api.controller.ts` for `/api/admin/ai-settings`. Without this
// guard any authenticated user could inspect / reset agent conversations on
// a self-host instance even when the license forbids the AI admin panel.
const AiAdminGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/agent')
@UseGuards(AiAdminGuard)
export class AgentOrchestratorController {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  @Get('conversations/:id')
  inspect(@Param('id') id: string): unknown {
    return this.orchestrator.inspect(id);
  }

  @Get('stats')
  stats(): { conversations: number; tools: number } {
    return this.orchestrator.stats();
  }

  @Post('conversations/:id/reset')
  reset(@Param('id') id: string): { ok: true; existed: boolean } {
    return { ok: true, existed: this.orchestrator.reset(id) };
  }
}
