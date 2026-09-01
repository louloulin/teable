/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Quota anomaly — admin HTTP controller (Stage 78).
 *
 *   GET /api/admin/quota-anomaly/list
 *   GET /api/admin/quota-anomaly/count
 *   GET /api/admin/quota-anomaly/thresholds
 *
 * Read-only views over the persisted anomaly reports and the active
 * detection thresholds. Mutations (sample ingestion, threshold tuning)
 * are not exposed here.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { QuotaAnomalyAuthService } from './quota-anomaly.auth.service';
import type { AnomalySeverity, QuotaMetric } from './quota-anomaly.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/quota-anomaly')
@UseGuards(AdminGuard)
export class QuotaAnomalyAdminController {
  constructor(private readonly svc: QuotaAnomalyAuthService) {}

  @Get('list')
  list(
    @Query('severity') severity?: string,
    @Query('metric') metric?: string,
    @Query('orgId') orgId?: string,
    @Query('limit') limit?: string
  ) {
    return this.svc.listReports({
      severity: severity as AnomalySeverity | undefined,
      metric: metric as QuotaMetric | undefined,
      orgId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('count')
  count(
    @Query('severity') severity?: string,
    @Query('metric') metric?: string,
    @Query('orgId') orgId?: string
  ) {
    return this.svc
      .countReports({
        severity: severity as AnomalySeverity | undefined,
        metric: metric as QuotaMetric | undefined,
        orgId,
      })
      .then((count) => ({ count }));
  }

  @Get('thresholds')
  thresholds() {
    return this.svc.getThresholds();
  }
}
