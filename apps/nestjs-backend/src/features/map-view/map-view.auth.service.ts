/**
 * Map / Geo view — Stage 56 (auth layer).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { DatabaseRouter } from '../../global/database-router.service';

import {
  applyRegionFilter,
  clusterMarkers,
  resolveMarker,
  validateConfig,
} from './map-view.service';
import type { IRowLike } from './map-view.service';
import type { IMapCluster, IMapMarker, IMapRegionFilter, IMapViewConfig } from './map-view.types';
import { MAX_MARKERS } from './map-view.types';

@Injectable()
export class MapViewAuthService {
  constructor(private readonly prisma: PrismaService, private readonly databaseRouter?: DatabaseRouter) {}

  async saveConfig(config: IMapViewConfig): Promise<IMapViewConfig> {
    const err = validateConfig(config);
    if (err) throw new Error(err);
    const stored = JSON.stringify(config);
    await this.prisma.mapViewConfig.upsert({
      where: { tableId: config.tableId },
      create: { tableId: config.tableId, config: stored },
      update: { config: stored },
    });
    return config;
  }

  async getConfig(tableId: string): Promise<IMapViewConfig | null> {
    const row = await this.prisma.mapViewConfig.findUnique({ where: { tableId } });
    if (!row) return null;
    return JSON.parse(row.config) as IMapViewConfig;
  }

  async loadMarkers(
    config: IMapViewConfig,
    filter: IMapRegionFilter = {},
    options: { clusterRadiusPx?: number; zoom?: number; limit?: number } = {}
  ): Promise<{
    markers: IMapMarker[];
    clusters: IMapCluster[];
    total: number;
  }> {
    const limit = Math.min(options.limit ?? MAX_MARKERS, MAX_MARKERS);
    const records = await this.loadRows(config.tableId, limit);
    const all = records
      .map((r) => resolveMarker({ id: r.id, cells: r.data as Record<string, unknown> }, config))
      .filter((m): m is IMapMarker => m !== null);
    const filtered = applyRegionFilter(all, filter);
    const clusters = clusterMarkers(filtered, {
      radiusPx: options.clusterRadiusPx ?? config.clusterRadius,
      zoom: options.zoom ?? config.initialView.zoom,
    });
    return { markers: filtered, clusters, total: all.length };
  }

  async loadRowsForTable(tableId: string, limit: number): Promise<IRowLike[]> {
    const records = await this.loadRows(tableId, limit);
    return records.map((r) => ({ id: r.id, cells: r.data as Record<string, unknown> }));
  }

  private async loadRows(tableId: string, limit: number): Promise<Array<{ id: string; data: unknown }>> {
    if (!this.databaseRouter) {
      return (await (this.prisma as unknown as { record?: { findMany: Function } }).record?.findMany({
        where: { tableId }, take: limit,
      })) ?? [];
    }
    const rows = await this.databaseRouter.queryDataPrismaForTable<Array<Record<string, unknown>>>(
      tableId, `SELECT * FROM "${tableId}" LIMIT ${Math.max(0, Math.floor(limit))}`
    );
    return rows.map((row) => ({ id: String(row.__id ?? row.id), data: row }));
  }
}
