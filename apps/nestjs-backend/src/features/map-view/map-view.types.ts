/**
 * Map / Geo view — Stage 56.
 *
 * Lets users attach latitude/longitude coordinates (or a single
 * `lat,lng` text field) to records and render them as map markers
 * with optional regional filtering and clustering.
 */

export interface IGeoPoint {
  /** Decimal degrees, [-90, 90]. */
  lat: number;
  /** Decimal degrees, [-180, 180]. */
  lng: number;
}

export type GeoSource = 'latLngFields' | 'combinedField' | 'geojson';

export interface IMapViewConfig {
  tableId: string;
  /** Field that holds latitude (when `source === 'latLngFields'`). */
  latFieldId?: string;
  /** Field that holds longitude. */
  lngFieldId?: string;
  /** Field that holds a combined `"lat,lng"` text when `source === 'combinedField'`. */
  combinedFieldId?: string;
  /** Field that holds a label to display in tooltips. */
  labelFieldId?: string;
  /** Cluster radius in pixels (0 = no clustering). */
  clusterRadius: number;
  /** Initial map view. */
  initialView: { center: IGeoPoint; zoom: number };
}

export interface IMapMarker {
  recordId: string;
  point: IGeoPoint;
  label?: string;
}

export interface IMapCluster {
  /** Cluster center (average of points). */
  center: IGeoPoint;
  /** Number of markers in the cluster. */
  count: number;
  /** Marker ids inside the cluster. */
  markerIds: ReadonlyArray<string>;
}

export interface IBoundingBox {
  southWest: IGeoPoint;
  northEast: IGeoPoint;
}

export interface IMapRegionFilter {
  /** Filter by country / region code (ISO-3166-1 alpha-2). */
  countryCode?: string;
  /** Filter by arbitrary region polygon (closed ring). */
  polygon?: ReadonlyArray<IGeoPoint>;
  /** Filter by visible bounding box. */
  bbox?: IBoundingBox;
}

export const DEFAULT_MAP_ZOOM = 4;
export const DEFAULT_CLUSTER_RADIUS = 60;
export const MAX_MARKERS = 10_000;
