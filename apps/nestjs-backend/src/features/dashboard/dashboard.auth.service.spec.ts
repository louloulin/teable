/**
 * Dashboard — NestJS auth service spec (Stage 130).
 */

import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DashboardAuthService } from './dashboard.auth.service';

function mkPrismaMock() {
  const dashboardFindMany = vi.fn();
  const prisma = {
    dashboard: { findMany: dashboardFindMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { dashboardFindMany } };
}

describe('DashboardAuthService', () => {
  it('listWidgetTypes returns the catalog when dashboards exist', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.dashboardFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    const svc = new DashboardAuthService(prisma);
    const out = await svc.listWidgetTypes('base1');
    expect(out.length).toBe(5);
    expect(out[0]?.label).toBe('Chart');
    expect(out[3]?.label).toBe('Embedded view');
  });

  it('listWidgetTypes returns empty array when no dashboards exist', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.dashboardFindMany.mockResolvedValue([]);
    const svc = new DashboardAuthService(prisma);
    const out = await svc.listWidgetTypes('empty');
    expect(out).toEqual([]);
  });

  it('bounds computes lower-right corner', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DashboardAuthService(prisma);
    expect(svc.bounds({ x: 2, y: 1, w: 4, h: 3 })).toEqual({
      x: 2,
      y: 1,
      w: 4,
      h: 3,
      right: 6,
      bottom: 4,
    });
  });

  it('format capitalises known widget kinds', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DashboardAuthService(prisma);
    expect(svc.format('chart')).toBe('Chart');
    expect(svc.format('embed')).toBe('Embedded view');
    expect(svc.format('plugin')).toBe('Plugin widget');
  });
});