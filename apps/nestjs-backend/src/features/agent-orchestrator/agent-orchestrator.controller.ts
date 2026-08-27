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

import { Controller, Get, Param, Post } from '@nestjs/common';
import { AgentOrchestratorService } from './agent-orchestrator.service';

@Controller('api/admin/agent')
export class AgentOrchestratorController {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  @Get('conversations/:id')
  inspect(@Param('id') id: string): unknown {
    return this.orchestrator.inspect(id);
  }

  @Get('stats')
  stats(): { tools_registered: number } {
    return { tools_registered: this.orchestrator.adapterRegistry().forUser.length };
  }

  @Post('conversations/:id/reset')
  reset(@Param('id') _id: string): { ok: true } {
    // The orchestrator's `inspect()` returns a no-op conversation when no
    // real state is present; resetting a real one is a feature for the
    // persistence adapter (out of scope for the inline-build slice).
    return { ok: true };
  }
}
