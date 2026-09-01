/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * BYOK LLM keys — admin HTTP controller (Round-INFRA-4).
 *
 * Read-only admin surface for inspecting per-org BYOK LLM keys and
 * their health snapshots. Wire-side mutations stay on
 * ByokLlmAuthService (called by org admins via the AI settings panel).
 *
 *   GET /api/admin/byok-llm/keys/:orgId
 *   GET /api/admin/byok-llm/keys/:orgId/count
 *   GET /api/admin/byok-llm/keys/:id/health
 *   GET /api/admin/byok-llm/keys/:id
 *
 * License: AGPL-3.0
 */
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { ByokLlmAuthService } from './byok-llm.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const AiGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/byok-llm')
@UseGuards(AiGuard)
export class ByokLlmController {
  constructor(private readonly auth: ByokLlmAuthService) {}

  @Get('keys/:orgId')
  async listKeys(@Param('orgId') orgId: string) {
    const keys = await this.auth.listKeys(orgId);
    return { organizationId: orgId, total: keys.length, keys };
  }

  @Get('keys/:orgId/count')
  async countKeys(@Param('orgId') orgId: string) {
    const count = await this.auth.countKeys(orgId);
    return { organizationId: orgId, count };
  }

  @Get('keys/:id')
  async loadKey(@Param('id') id: string) {
    const key = await this.auth.loadKey(id);
    if (!key) throw new NotFoundException(`BYOK key not found: ${id}`);
    return key;
  }

  @Get('keys/:id/health')
  async health(@Param('id') id: string) {
    const snapshot = await this.auth.health(id);
    if (!snapshot) throw new NotFoundException(`no health snapshot for key: ${id}`);
    return snapshot;
  }
}
