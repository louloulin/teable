/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { WidgetMarketAuthService } from './widget-market.auth.service';

function mkPrismaMock() {
  const dashboardFindMany = vi.fn();
  const dashboardCreate = vi.fn();
  const widgetInstanceFindMany = vi.fn();
  const widgetInstanceCount = vi.fn();
  const widgetInstanceCreate = vi.fn();
  const widgetInstanceFindUnique = vi.fn();
  const widgetInstanceDelete = vi.fn();
  const recordFindMany = vi.fn();

  const prisma = {
    dashboard: {
      findMany: dashboardFindMany,
      create: dashboardCreate,
    },
    widgetInstance: {
      findMany: widgetInstanceFindMany,
      count: widgetInstanceCount,
      create: widgetInstanceCreate,
      findUnique: widgetInstanceFindUnique,
      delete: widgetInstanceDelete,
    },
    record: {
      findMany: recordFindMany,
    },
  } as unknown as PrismaService;

  return {
    prisma,
    mocks: {
      dashboardFindMany,
      dashboardCreate,
      widgetInstanceFindMany,
      widgetInstanceCount,
      widgetInstanceCreate,
      widgetInstanceFindUnique,
      widgetInstanceDelete,
      recordFindMany,
    },
  };
}

describe('WidgetMarketAuthService', () => {
  describe('listWidgets', () => {
    it('returns 7 kinds', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.listWidgets();
      expect(out).toHaveLength(7);
      expect(out.find((w) => w.kind === 'kpi')).toBeDefined();
    });
  });

  describe('dashboards', () => {
    it('lists dashboards by space', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.dashboardFindMany.mockResolvedValue([
        { id: 'd1', name: 'Sales' },
        { id: 'd2', name: 'Ops' },
      ]);
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.listDashboards('space-1');
      expect(out).toHaveLength(2);
    });
    it('creates a dashboard', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.dashboardCreate.mockResolvedValue({ id: 'd-new', name: 'New' });
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.createDashboard('space-1', 'New');
      expect(out.id).toBe('d-new');
    });
  });

  describe('addInstance', () => {
    it('persists a widget and decodes back', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceCount.mockResolvedValue(0);
      mocks.widgetInstanceCreate.mockImplementation(({ data }) => ({
        id: data.id,
        dashboardId: data.dashboardId,
        definition: data.definition,
        binding: data.binding,
        position: data.position,
        options: data.options,
        createdAt: new Date(),
      }));
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.addInstance('d1', {
        definition: 'line',
        binding: {
          tableId: 't1',
          dimensionFieldId: 'cat',
          metricFieldId: 'val',
          aggregation: 'sum',
        },
        position: { x: 0, y: 0, w: 3, h: 2 },
        options: {},
      });
      expect(out.definition).toBe('line');
      expect(out.binding.tableId).toBe('t1');
      expect(mocks.widgetInstanceCreate).toHaveBeenCalledTimes(1);
    });
    it('rejects bad binding', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceCount.mockResolvedValue(0);
      const svc = new WidgetMarketAuthService(prisma);
      await expect(
        svc.addInstance('d1', {
          definition: 'line' as never,
          binding: { tableId: '', dimensionFieldId: '' } as never,
          position: { x: 0, y: 0, w: 3, h: 2 },
          options: {},
        })
      ).rejects.toThrow();
    });
  });

  describe('removeInstance', () => {
    it('delegates to Prisma delete', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceDelete.mockResolvedValue({});
      const svc = new WidgetMarketAuthService(prisma);
      await svc.removeInstance('w1');
      expect(mocks.widgetInstanceDelete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    });
  });

  describe('render', () => {
    it('loads rows and produces KPI scalar', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceFindUnique.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        definition: 'kpi',
        binding: JSON.stringify({
          tableId: 't1',
          dimensionFieldId: 'cat',
          metricFieldId: 'val',
          aggregation: 'sum',
        }),
        position: JSON.stringify({ x: 0, y: 0, w: 3, h: 2 }),
        options: JSON.stringify({}),
        createdAt: new Date(),
      });
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 't1', data: { cat: 'A', val: 10 } },
        { id: 'r2', tableId: 't1', data: { cat: 'B', val: 20 } },
      ]);
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.render('w1', 100);
      expect(out.scalar).toBe(30);
    });
    it('throws on missing widget', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceFindUnique.mockResolvedValue(null);
      const svc = new WidgetMarketAuthService(prisma);
      await expect(svc.render('missing', 100)).rejects.toThrow();
    });
  });

  describe('renderDashboard', () => {
    it('renders all widgets in a dashboard', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.widgetInstanceFindMany.mockResolvedValue([
        {
          id: 'w1',
          dashboardId: 'd1',
          definition: 'counter',
          binding: JSON.stringify({ tableId: 't1', dimensionFieldId: 'cat', aggregation: 'count' }),
          position: JSON.stringify({ x: 0, y: 0, w: 3, h: 2 }),
          options: JSON.stringify({}),
          createdAt: new Date(),
        },
      ]);
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 't1', data: { cat: 'A' } },
        { id: 'r2', tableId: 't1', data: { cat: 'A' } },
      ]);
      const svc = new WidgetMarketAuthService(prisma);
      const out = await svc.renderDashboard('d1', 100);
      expect(out.widgets).toHaveLength(1);
      expect(out.widgets[0]?.result.scalar).toBe(2);
    });
  });
});
