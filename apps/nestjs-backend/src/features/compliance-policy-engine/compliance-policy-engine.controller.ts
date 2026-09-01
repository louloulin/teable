/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Compliance Policy Engine — admin endpoints (under `/api/admin/compliance-policy-engine/*`).
 *
 * Read-only views over the built-in policy bundle and a status ping used by
 * the admin panel. Gated by the `admin_panel` LicenseCapabilityGuard so the
 * surface is paid-tier when licensed, falls through to OSS in self-hosted mode.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { CompliancePolicyEngineAuthService } from './compliance-policy-engine.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/compliance-policy-engine')
@UseGuards(AdminGuard)
export class CompliancePolicyEngineController {
  constructor(private readonly svc: CompliancePolicyEngineAuthService) {}

  @Get('list')
  async list() {
    const rules = this.svc.builtin();
    return {
      version: '1.0.0',
      total: rules.length,
      rules,
    };
  }

  @Get('count')
  async count() {
    const rules = this.svc.builtin();
    const bySeverity = rules.reduce<Record<string, number>>((acc, r) => {
      acc[r.severity] = (acc[r.severity] ?? 0) + 1;
      return acc;
    }, {});
    return { total: rules.length, bySeverity };
  }

  @Get('status')
  async status() {
    const ok = await this.svc.ping();
    return { ok, totalRules: this.svc.builtin().length };
  }
}
