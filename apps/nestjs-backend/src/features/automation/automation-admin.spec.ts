import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { describe, expect, it, vi } from 'vitest';
import { AutomationAdminController } from './automation-admin.controller';

function createController() {
  const findMany = vi.fn();
  const prisma = { automation: { findMany } } as unknown as PrismaService;
  return { controller: new AutomationAdminController(prisma), findMany };
}

describe('AutomationAdminController', () => {
  it('returns an empty summary when no automations exist', async () => {
    const { controller, findMany } = createController();
    findMany.mockResolvedValue([]);

    await expect(controller.overview()).resolves.toMatchObject({
      hours: 24,
      summary: {
        activeWorkflows: 0,
        totalRuns: 0,
        succeededRuns: 0,
        failedRuns: 0,
        successRate: null,
      },
      statusDistribution: {},
      automations: [],
      recentRuns: [],
    });
  });

  it('calculates success rate and clamps the requested window', async () => {
    const { controller, findMany } = createController();
    const now = new Date();
    findMany.mockResolvedValue([
      {
        id: 'automation-1',
        baseId: 'base-1',
        name: 'Sync',
        enabled: true,
        createdTime: now,
        runs: [
          {
            id: 'run-1',
            automationId: 'automation-1',
            triggerType: 'schedule',
            status: 'succeeded',
            error: null,
            retryCount: 0,
            startedAt: now,
            finishedAt: now,
            createdTime: now,
          },
          {
            id: 'run-2',
            automationId: 'automation-1',
            triggerType: 'schedule',
            status: 'failed',
            error: 'timeout',
            retryCount: 1,
            startedAt: now,
            finishedAt: now,
            createdTime: new Date(now.getTime() - 1),
          },
        ],
      },
    ]);

    await expect(controller.overview('99999', 'schedule')).resolves.toMatchObject({
      hours: 24 * 30,
      summary: {
        activeWorkflows: 1,
        totalRuns: 2,
        succeededRuns: 1,
        failedRuns: 1,
        successRate: 0.5,
      },
      statusDistribution: { succeeded: 1, failed: 1 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          runs: expect.objectContaining({
            where: expect.objectContaining({ triggerType: 'schedule' }),
          }),
        }),
      })
    );
  });

  it('rejects an unsupported trigger filter before querying', async () => {
    const { controller, findMany } = createController();

    await expect(controller.overview('24', 'not-a-trigger')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('accepts the documented canceled alias and maps it to skipped', async () => {
    const { controller, findMany } = createController();
    findMany.mockResolvedValue([]);

    await expect(controller.overview('0.5', undefined, 'canceled')).resolves.toMatchObject({
      hours: 0.5,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          runs: expect.objectContaining({
            where: expect.objectContaining({ status: 'skipped' }),
          }),
        }),
      })
    );
  });

  it('rejects an unsupported run status before querying', async () => {
    const { controller, findMany } = createController();

    await expect(controller.overview('24', undefined, 'not-a-status')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
