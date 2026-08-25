/**
 * Map / Geo view — Stage 56.
 *
 * Pure helpers: parse coordinates out of records, validate config,
 * apply bounding box / polygon filters, and cluster markers.
 */

import type {
  GeoSource,
  IBoundingBox,
  IGeoPoint,
  IMapCluster,
  IMapMarker,
  IMapRegionFilter,
  IMapViewConfig,
} from './map-view.types';
import { DEFAULT_CLUSTER_RADIUS } from './map-view.types';

const EARTH_RADIUS_KM = 6371;

export interface IRowLike {
  id: string;
  cells: Record<string, unknown>;
}

export function isGeoSource(value: unknown): value is GeoSource {
  return value === 'latLngFields' || value === 'combinedField' || value === 'geojson';
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Convert decimal degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points in kilometres. */
export function haversineKm(a: IGeoPoint, b: IGeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function parseCombined(value: unknown): IGeoPoint | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/** Resolve a single record to a marker. Returns null when no point. */
export function resolveMarker(record: IRowLike, config: IMapViewConfig): IMapMarker | null {
  const latId = config.latFieldId ?? '';
  const lngId = config.lngFieldId ?? '';
  if (latId && lngId) {
    const lat = Number(record.cells[latId]);
    const lng = Number(record.cells[lngId]);
    if (!isValidLatLng(lat, lng)) return null;
    const label = config.labelFieldId ? String(record.cells[config.labelFieldId] ?? '') : undefined;
    return { recordId: record.id, point: { lat, lng }, label };
  }
  const combinedId = config.combinedFieldId ?? '';
  if (combinedId) {
    const point = parseCombined(record.cells[combinedId]);
    if (!point) return null;
    const label = config.labelFieldId ? String(record.cells[config.labelFieldId] ?? '') : undefined;
    return { recordId: record.id, point, label };
  }
  return null;
}

/** Apply region filter; markers must be inside bbox / polygon if specified. */
export function applyRegionFilter(
  markers: ReadonlyArray<IMapMarker>,
  filter: IMapRegionFilter
): IMapMarker[] {
  return markers.filter((m) => {
    if (filter.countryCode && countryOf(m.point) !== filter.countryCode.toUpperCase()) return false;
    if (filter.bbox && !inBoundingBox(m.point, filter.bbox)) return false;
    if (filter.polygon && !inPolygon(m.point, filter.polygon)) return false;
    return true;
  });
}

/** Trivial ISO-3166 placeholder: derive a code from the lat band — used only when no real geocoding is available. */
export function countryOf(point: IGeoPoint): string {
  if (point.lat >= 24 && point.lat <= 50 && point.lng >= -125 && point.lng <= -66) return 'US';
  if (point.lat >= 41 && point.lat <= 71 && point.lng >= -10 && point.lng <= 40) return 'EU';
  if (point.lat >= 18 && point.lat <= 54 && point.lng >= 73 && point.lng <= 135) return 'CN';
  return 'XX';
}

export function inBoundingBox(point: IGeoPoint, bbox: IBoundingBox): boolean {
  return (
    point.lat >= bbox.southWest.lat &&
    point.lat <= bbox.northEast.lat &&
    point.lng >= bbox.southWest.lng &&
    point.lng <= bbox.northEast.lng
  );
}

/** Ray-casting point-in-polygon. Polygon is a closed ring (first/last vertex may repeat). */
export function inPolygon(point: IGeoPoint, polygon: ReadonlyArray<IGeoPoint>): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersect =
      a.lng > point.lng !== b.lng > point.lng &&
      point.lat <
        ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng || Number.EPSILON) + a.lat;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Greedy clustering — pick a seed marker, fold any other marker within
 * `clusterRadiusKm` (computed from `radiusPx` at the equator + a rough
 * pixel-to-km conversion using zoom). Returns clusters + leftover
 * singleton markers.
 */
export function clusterMarkers(
  markers: ReadonlyArray<IMapMarker>,
  options: { radiusPx?: number; zoom?: number } = {}
): IMapCluster[] {
  const radiusPx = options.radiusPx ?? DEFAULT_CLUSTER_RADIUS;
  const zoom = options.zoom ?? 4;
  if (radiusPx <= 0 || markers.length === 0) return [];

  const radiusKm = pixelsToKm(radiusPx, zoom);
  const remaining = [...markers];
  const clusters: IMapCluster[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (!seed) break;
    const group: IMapMarker[] = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const candidate = remaining[i];
      if (!candidate) continue;
      if (haversineKm(seed.point, candidate.point) <= radiusKm) {
        group.push(candidate);
        remaining.splice(i, 1);
      }
    }
    const center = averagePoint(group.map((m) => m.point));
    clusters.push({ center, count: group.length, markerIds: group.map((m) => m.recordId) });
  }
  return clusters;
}

export function averagePoint(points: ReadonlyArray<IGeoPoint>): IGeoPoint {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/** Rough pixel-to-km conversion at a given zoom (Web Mercator). */
export function pixelsToKm(radiusPx: number, zoom: number): number {
  const metersPerPx = (40075016.686 * Math.cos(0)) / Math.pow(2, zoom + 8);
  return (radiusPx * metersPerPx) / 1000;
}

export function validateConfig(config: Partial<IMapViewConfig>): string | null {
  if (!config.tableId) return 'tableId required';
  const hasLatLng = config.latFieldId && config.lngFieldId;
  const hasCombined = config.combinedFieldId;
  if (!hasLatLng && !hasCombined) {
    return 'either latFieldId+lngFieldId or combinedFieldId required';
  }
  if (config.clusterRadius !== undefined && config.clusterRadius < 0) {
    return 'clusterRadius must be >= 0';
  }
  if (config.initialView) {
    const { center, zoom } = config.initialView;
    if (!isValidLatLng(center.lat, center.lng)) return 'invalid initialView.center';
    if (zoom < 0 || zoom > 22) return 'initialView.zoom out of range';
  }
  return null;
}
