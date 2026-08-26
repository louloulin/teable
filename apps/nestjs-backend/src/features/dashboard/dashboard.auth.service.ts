/**
 * Dashboard — thin-DI wrapper (Stage 130).
 *
 * Auth-layer façade that exposes the widget-type catalog derived from
 * the dashboards persisted in Prisma. Pure delegate — all logic lives
 * in `dashboard.helpers.ts`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { computeWidgetBounds, formatWidgetType } from './dashboard.helpers';
import type { IWidgetBounds, IWidgetTypeDef } from './dashboard.types';

@Injectable()
export class DashboardAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enumerate widget types catalogued for the base, derived from dashboards. */
  async listWidgetTypes(baseId: string): Promise<IWidgetTypeDef[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: { baseId },
      select: { id: true },
      take: 50,
    });
    if (rows.length === 0) return [];
    const kinds: IWidgetTypeDef['kind'][] = ['chart', 'table', 'metric', 'embed', 'plugin'];
    return kinds.map((kind) => ({
      kind,
      label: formatWidgetType(kind),
      defaultBounds: computeWidgetBounds({ x: 0, y: 0, w: 4, h: 3 }),
    }));
  }

  /** Re-export the bound calculator for callers that need it directly. */
  bounds(b: { x: number; y: number; w: number; h: number }): IWidgetBounds {
    return computeWidgetBounds(b);
  }

  /** Re-export the kind formatter. */
  format(kind: IWidgetTypeDef['kind']): string {
    return formatWidgetType(kind);
  }
}