/**
 * Dashboard widget market — Stage 55 (auth layer).
 *
 * Loads raw rows from Prisma, runs them through `renderWidget`, and
 * persists widget instances / dashboards.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { DatabaseRouter } from '../../global/database-router.service';

import {
  defaultPosition,
  newWidgetInstanceId,
  renderWidget,
  validateWidgetInstance,
} from './widget-market.service';
import type { IRowLike } from './widget-market.service';
import type { IWidgetInstance, IWidgetRenderResult } from './widget-market.types';
import { WIDGET_DEFINITIONS } from './widget-market.types';

interface IDashboardRow {
  id: string;
  name: string;
}

interface IWidgetRow {
  id: string;
  dashboardId: string;
  definition: string;
  binding: string;
  position: string;
  options: string;
  createdAt: Date;
}

@Injectable()
export class WidgetMarketAuthService {
  constructor(private readonly prisma: PrismaService, private readonly databaseRouter?: DatabaseRouter) {}

  async listWidgets(): Promise<{ kind: string; title: string; description: string }[]> {
    return WIDGET_DEFINITIONS.map((w) => ({
      kind: w.kind,
      title: w.title,
      description: w.requiresMetric ? '需要维度字段 + 度量字段' : '仅需维度字段',
    }));
  }

  async listDashboards(spaceId: string): Promise<IDashboardRow[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: { baseId: spaceId },
      orderBy: { createdTime: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async createDashboard(spaceId: string, name: string): Promise<IDashboardRow> {
    const row = await this.prisma.dashboard.create({
      data: { baseId: spaceId, name, createdBy: 'system' },
    });
    return { id: row.id, name: row.name };
  }

  async listInstances(dashboardId: string): Promise<IWidgetInstance[]> {
    const rows = await this.prisma.widgetInstance.findMany({
      where: { dashboardId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => decodeWidgetRow(r));
  }

  async addInstance(
    dashboardId: string,
    draft: Omit<IWidgetInstance, 'id' | 'dashboardId'>
  ): Promise<IWidgetInstance> {
    const existing = await this.prisma.widgetInstance.count({ where: { dashboardId } });
    const filled: IWidgetInstance = {
      id: newWidgetInstanceId(),
      dashboardId,
      definition: draft.definition,
      binding: draft.binding,
      position: draft.position ?? defaultPosition(existing),
      options: draft.options ?? {},
    };
    const err = validateWidgetInstance(filled, existing);
    if (err) throw new Error(err);
    const created = await this.prisma.widgetInstance.create({
      data: {
        id: filled.id,
        dashboardId,
        definition: filled.definition,
        binding: JSON.stringify(filled.binding),
        position: JSON.stringify(filled.position),
        options: JSON.stringify(filled.options),
      },
    });
    return decodeWidgetRow(created);
  }

  async removeInstance(instanceId: string): Promise<void> {
    await this.prisma.widgetInstance.delete({ where: { id: instanceId } });
  }

  async render(instanceId: string, limit: number): Promise<IWidgetRenderResult> {
    const row = await this.prisma.widgetInstance.findUnique({ where: { id: instanceId } });
    if (!row) throw new Error(`widget not found: ${instanceId}`);
    const instance = decodeWidgetRow(row);
    const records = await this.loadRows(instance.binding.tableId, limit);
    const rows: IRowLike[] = records.map((r) => ({ cells: r.data as Record<string, unknown> }));
    return renderWidget(instance, rows);
  }

  async renderDashboard(
    dashboardId: string,
    limit: number
  ): Promise<{
    dashboardId: string;
    widgets: { instance: IWidgetInstance; result: IWidgetRenderResult }[];
  }> {
    const instances = await this.listInstances(dashboardId);
    const out: { instance: IWidgetInstance; result: IWidgetRenderResult }[] = [];
    for (const inst of instances) {
      const records = await this.loadRows(inst.binding.tableId, limit);
      const rows: IRowLike[] = records.map((r) => ({ cells: r.data as Record<string, unknown> }));
      out.push({ instance: inst, result: renderWidget(inst, rows) });
    }
    return { dashboardId, widgets: out };
  }

  private async loadRows(tableId: string, limit: number): Promise<Array<{ data: unknown }>> {
    if (!this.databaseRouter) {
      return (await (this.prisma as unknown as { record?: { findMany: Function } }).record?.findMany({
        where: { tableId }, take: limit,
      })) ?? [];
    }
    const rows = await this.databaseRouter.queryDataPrismaForTable<Array<Record<string, unknown>>>(
      tableId, `SELECT * FROM "${tableId}" LIMIT ${Math.max(0, Math.floor(limit))}`
    );
    return rows.map((data) => ({ data }));
  }
}

function decodeWidgetRow(row: IWidgetRow): IWidgetInstance {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    definition: row.definition as IWidgetInstance['definition'],
    binding: JSON.parse(row.binding),
    position: JSON.parse(row.position),
    options: JSON.parse(row.options),
  };
}
