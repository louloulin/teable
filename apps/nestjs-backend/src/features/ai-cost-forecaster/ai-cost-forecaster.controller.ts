/**
 * HTTP wrapper around the cost forecaster.
 *
 * `GET /api/admin/ai-cost/forecast?days=14` — runs the forecast with the
 * supplied lookback.  Returns the projected total + confidence flag.
 *
 * `GET /api/admin/ai-cost/forecast/series` — returns the raw per-day
 * series so dashboards can render the trend without re-querying.
 *
 * The Prisma-backed `UsageLoader` is wired in production; tests pass a
 * stub via DI.
 *
 * License: AGPL-3.0
 */

import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { forecastCredits, ForecastOutput, UsageRow } from './ai-cost-forecaster';

export interface UsageLoader {
  loadRecent(days: number): Promise<UsageRow[]>;
}

// AI admin-panel capability gate — matches the pattern used by
// `admin-open-api.controller.ts` for `/api/admin/ai-settings`. Cost forecast
// data exposes per-tenant AI usage; gate behind the same `ai` license cap.
const AiAdminGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/ai-cost')
@UseGuards(AiAdminGuard)
export class AiCostForecasterController {
  constructor(@Inject('USAGE_LOADER') private readonly loader: UsageLoader) {}

  @Get('forecast')
  async forecast(
    @Query('days') days?: string,
    @Query('cycle_end') cycleEnd?: string,
    @Query('alert') alert?: string
  ): Promise<ForecastOutput> {
    const lookback = days ? Math.max(1, Number(days)) : 14;
    const rows = await this.loader.loadRecent(lookback);
    const cycleDays = cycleEnd ? Number(cycleEnd) : 30;
    return forecastCredits(
      {
        rows,
        days_until_cycle_end: cycleDays,
      },
      alert ? Number(alert) : undefined
    );
  }

  @Get('forecast/series')
  async series(@Query('days') days?: string): Promise<UsageRow[]> {
    return this.loader.loadRecent(days ? Math.max(1, Number(days)) : 14);
  }
}
