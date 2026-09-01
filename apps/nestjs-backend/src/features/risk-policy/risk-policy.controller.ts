/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk policy — admin HTTP controller (Round-INFRA-7).
 *
 *   GET  /api/admin/risk-policy/list
 *   GET  /api/admin/risk-policy/:id
 *   POST /api/admin/risk-policy/evaluate
 *
 * Read-only views over persisted policies plus a synchronous
 * evaluation endpoint that runs the rule engine against caller
 * supplied signals without persisting the decision.
 *
 * License: AGPL-3.0
 */
import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { RiskPolicyAuthService } from './risk-policy.auth.service';
import type { IRiskSignal } from './risk-policy.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface IEvaluateBody {
  policy: Parameters<RiskPolicyAuthService['evaluate']>[0]['policy'];
  signals: IRiskSignal[];
  actorId: string;
  exempt?: boolean;
}

@Controller('api/admin/risk-policy')
@UseGuards(AdminGuard)
export class RiskPolicyAdminController {
  constructor(private readonly svc: RiskPolicyAuthService) {}

  @Get('list')
  async list(@Query('orgId') orgId?: string) {
    if (!orgId) throw new NotFoundException('orgId query param required');
    const policies = await this.svc.listPolicies(orgId);
    return { total: policies.length, policies };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const policy = await this.svc.loadPolicy(id);
    if (!policy) throw new NotFoundException(`policy not found: ${id}`);
    return policy;
  }

  @Post('evaluate')
  evaluate(@Body() body: IEvaluateBody) {
    if (!body?.policy || !body?.actorId || !Array.isArray(body?.signals)) {
      throw new NotFoundException('policy, actorId, and signals[] are required');
    }
    return this.svc.evaluate({
      policy: body.policy,
      signals: body.signals,
      actorId: body.actorId,
      ...(body.exempt !== undefined ? { exempt: body.exempt } : {}),
    });
  }
}
