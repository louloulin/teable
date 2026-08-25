/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { MapViewAuthService } from './map-view.auth.service';
import type { IMapViewConfig } from './map-view.types';

function mkPrismaMock() {
  const mapViewConfigUpsert = vi.fn();
  const mapViewConfigFindUnique = vi.fn();
  const recordFindMany = vi.fn();

  const prisma = {
    mapViewConfig: {
      upsert: mapViewConfigUpsert,
      findUnique: mapViewConfigFindUnique,
    },
    record: { findMany: recordFindMany },
  } as unknown as PrismaService;

  return { prisma, mocks: { mapViewConfigUpsert, mapViewConfigFindUnique, recordFindMany } };
}

const baseConfig: IMapViewConfig = {
  tableId: 'tbl',
  latFieldId: 'lat',
  lngFieldId: 'lng',
  clusterRadius: 60,
  initialView: { center: { lat: 0, lng: 0 }, zoom: 4 },
};

describe('MapViewAuthService', () => {
  describe('saveConfig', () => {
    it('upserts and returns the config', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.mapViewConfigUpsert.mockResolvedValue({});
      const svc = new MapViewAuthService(prisma);
      const out = await svc.saveConfig(baseConfig);
      expect(out).toEqual(baseConfig);
      expect(mocks.mapViewConfigUpsert).toHaveBeenCalledTimes(1);
    });
    it('rejects invalid config', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.mapViewConfigUpsert.mockResolvedValue({});
      const svc = new MapViewAuthService(prisma);
      await expect(svc.saveConfig({ ...baseConfig, tableId: '' })).rejects.toThrow();
      expect(mocks.mapViewConfigUpsert).not.toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('returns null when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.mapViewConfigFindUnique.mockResolvedValue(null);
      const svc = new MapViewAuthService(prisma);
      expect(await svc.getConfig('tbl')).toBeNull();
    });
    it('decodes stored config', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.mapViewConfigFindUnique.mockResolvedValue({
        tableId: 'tbl',
        config: JSON.stringify(baseConfig),
      });
      const svc = new MapViewAuthService(prisma);
      const out = await svc.getConfig('tbl');
      expect(out?.latFieldId).toBe('lat');
    });
  });

  describe('loadMarkers', () => {
    it('resolves, filters, and clusters', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 'tbl', data: { lat: 37, lng: -122 } },
        { id: 'r2', tableId: 'tbl', data: { lat: 40, lng: -74 } },
        { id: 'r3', tableId: 'tbl', data: { lat: 'bad', lng: 0 } },
      ]);
      const svc = new MapViewAuthService(prisma);
      const out = await svc.loadMarkers(baseConfig, {}, { clusterRadiusPx: 0 });
      expect(out.total).toBe(2);
      expect(out.markers).toHaveLength(2);
      expect(out.clusters).toEqual([]);
    });
    it('clusters when radius is non-zero', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 'tbl', data: { lat: 37, lng: -122 } },
        { id: 'r2', tableId: 'tbl', data: { lat: 37.001, lng: -122.001 } },
      ]);
      const svc = new MapViewAuthService(prisma);
      const out = await svc.loadMarkers(baseConfig, {}, { clusterRadiusPx: 100, zoom: 4 });
      expect(out.clusters.length).toBeGreaterThan(0);
    });
    it('filters by bbox', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 'tbl', data: { lat: 37, lng: -122 } },
        { id: 'r2', tableId: 'tbl', data: { lat: 40, lng: -74 } },
      ]);
      const svc = new MapViewAuthService(prisma);
      const out = await svc.loadMarkers(
        baseConfig,
        { bbox: { southWest: { lat: 36, lng: -130 }, northEast: { lat: 45, lng: -100 } } },
        { clusterRadiusPx: 0 }
      );
      expect(out.markers.map((m) => m.recordId)).toEqual(['r1']);
    });
  });
});
