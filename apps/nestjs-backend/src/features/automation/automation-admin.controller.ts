import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import {
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationRunStatus,
  type AutomationTriggerType,
} from './automation.types';

const AutomationAdminGuard = LicenseCapabilityGuard.for('automation');

const MAX_HOURS = 24 * 30;
const MIN_HOURS = 0.5;
const MAX_AUTOMATIONS = 500;
const MAX_RUNS_PER_AUTOMATION = 100;

/** Read-only instance-wide automation summary for Admin Panel operators. */
@Controller('api/admin/automation')
@UseGuards(AutomationAdminGuard)
@Permissions('instance|read')
export class AutomationAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(
    @Query('hours') rawHours?: string,
    @Query('triggerType') triggerType?: string,
    @Query('status') status?: string
  ) {
    const parsedHours = Number(rawHours ?? 24);
    const hours = Math.min(
      Math.max(Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 24, MIN_HOURS),
      MAX_HOURS
    );
    if (triggerType && !AUTOMATION_TRIGGER_TYPES.includes(triggerType as AutomationTriggerType)) {
      throw new BadRequestException(`Unsupported automation trigger type: ${triggerType}`);
    }
    if (
      status !== 'canceled' &&
      status &&
      !AUTOMATION_RUN_STATUSES.includes(status as AutomationRunStatus)
    ) {
      throw new BadRequestException(`Unsupported automation run status: ${status}`);
    }
    const persistedStatus = status === 'canceled' ? 'skipped' : status;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const automations = await this.prisma.automation.findMany({
      take: MAX_AUTOMATIONS,
      orderBy: { createdTime: 'desc' },
      include: {
        runs: {
          where: {
            createdTime: { gte: since },
            ...(triggerType ? { triggerType: triggerType as AutomationTriggerType } : {}),
            ...(persistedStatus ? { status: persistedStatus as AutomationRunStatus } : {}),
          },
          orderBy: { createdTime: 'desc' },
          take: MAX_RUNS_PER_AUTOMATION,
          select: {
            id: true,
            automationId: true,
            triggerType: true,
            status: true,
            error: true,
            retryCount: true,
            startedAt: true,
            finishedAt: true,
            createdTime: true,
          },
        },
      },
    });

    const runs = automations.flatMap((automation) =>
      automation.runs.map((run) => ({
        ...run,
        automationName: automation.name,
        baseId: automation.baseId,
      }))
    );
    const succeeded = runs.filter((run) => run.status === 'succeeded').length;
    const failed = runs.filter((run) => run.status === 'failed').length;
    const activeWorkflows = automations.filter((automation) => automation.enabled).length;
    const durations = runs
      .filter((run) => run.startedAt && run.finishedAt)
      .map((run) => run.finishedAt!.getTime() - run.startedAt!.getTime());
    const healthOverview = automations.reduce(
      (health, automation) => {
        if (!automation.enabled) return health;
        const failures = automation.runs.filter((run) => run.status === 'failed').length;
        const target = failures >= 3 ? 'critical' : failures > 0 ? 'warning' : 'healthy';
        health[target] += 1;
        return health;
      },
      { healthy: 0, warning: 0, critical: 0 }
    );

    return {
      hours,
      since: since.toISOString(),
      summary: {
        activeWorkflows,
        totalRuns: runs.length,
        succeededRuns: succeeded,
        failedRuns: failed,
        successRate: runs.length === 0 ? null : succeeded / runs.length,
        averageDurationMs:
          durations.length === 0
            ? null
            : Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length),
      },
      healthOverview,
      statusDistribution: runs.reduce<Record<string, number>>((counts, run) => {
        counts[run.status] = (counts[run.status] ?? 0) + 1;
        return counts;
      }, {}),
      automations: automations.map((automation) => ({
        id: automation.id,
        baseId: automation.baseId,
        name: automation.name,
        enabled: automation.enabled,
        runCount: automation.runs.length,
        lastRun: automation.runs[0]?.createdTime ?? null,
        failedRuns: automation.runs.filter((run) => run.status === 'failed').length,
        averageDurationMs: (() => {
          const completed = automation.runs.filter((run) => run.startedAt && run.finishedAt);
          if (completed.length === 0) return null;
          return Math.round(
            completed.reduce(
              (sum, run) => sum + (run.finishedAt!.getTime() - run.startedAt!.getTime()),
              0
            ) / completed.length
          );
        })(),
        health: automation.enabled
          ? automation.runs.filter((run) => run.status === 'failed').length >= 3
            ? 'critical'
            : automation.runs.some((run) => run.status === 'failed')
              ? 'warning'
              : 'healthy'
          : 'inactive',
      })),
      recentRuns: runs
        .sort((left, right) => right.createdTime.getTime() - left.createdTime.getTime())
        .slice(0, 200),
    };
  }

  @Get(':id/runs')
  async runs(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('take') rawTake?: string
  ) {
    if (
      status !== 'canceled' &&
      status &&
      !AUTOMATION_RUN_STATUSES.includes(status as AutomationRunStatus)
    ) {
      throw new BadRequestException(`Unsupported automation run status: ${status}`);
    }
    const persistedStatus = status === 'canceled' ? 'skipped' : status;
    const take = Math.min(Math.max(Number(rawTake ?? 50) || 50, 1), 200);
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      select: { id: true, baseId: true, name: true, enabled: true },
    });
    if (!automation) throw new NotFoundException(`automation ${id} not found`);
    const runs = await this.prisma.automationRun.findMany({
      where: {
        automationId: id,
        ...(persistedStatus ? { status: persistedStatus as AutomationRunStatus } : {}),
      },
      orderBy: { createdTime: 'desc' },
      take,
      select: {
        id: true,
        automationId: true,
        triggerType: true,
        status: true,
        error: true,
        retryCount: true,
        startedAt: true,
        finishedAt: true,
        createdTime: true,
      },
    });
    return { automation, runs };
  }

  @Patch(':id/deactivate')
  @Permissions('instance|update')
  async deactivate(@Param('id') id: string) {
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      select: { id: true, baseId: true, name: true, enabled: true },
    });
    if (!automation) throw new NotFoundException(`automation ${id} not found`);
    if (!automation.enabled) return automation;
    return this.prisma.automation.update({
      where: { id },
      data: { enabled: false },
      select: { id: true, baseId: true, name: true, enabled: true },
    });
  }
}
