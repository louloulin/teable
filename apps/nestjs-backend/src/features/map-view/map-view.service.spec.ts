/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyRegionFilter,
  averagePoint,
  clusterMarkers,
  countryOf,
  haversineKm,
  inBoundingBox,
  inPolygon,
  isGeoSource,
  isValidLatLng,
  parseCombined,
  pixelsToKm,
  resolveMarker,
  validateConfig,
} from './map-view.service';
import type { IMapViewConfig } from './map-view.types';

describe('map-view.coords', () => {
  it('accepts valid lat/lng', () => {
    expect(isValidLatLng(0, 0)).toBe(true);
    expect(isValidLatLng(45.5, -122.6)).toBe(true);
  });
  it('rejects invalid lat/lng', () => {
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
  });
  it('identifies sources', () => {
    expect(isGeoSource('latLngFields')).toBe(true);
    expect(isGeoSource('bogus' as never)).toBe(false);
  });
});

describe('map-view.parseCombined', () => {
  it('parses "lat,lng"', () => {
    expect(parseCombined('37.7749,-122.4194')).toEqual({ lat: 37.7749, lng: -122.4194 });
  });
  it('trims whitespace', () => {
    expect(parseCombined(' 12.3 , 45.6 ')).toEqual({ lat: 12.3, lng: 45.6 });
  });
  it('rejects bad input', () => {
    expect(parseCombined('foo')).toBeNull();
    expect(parseCombined('100,0')).toBeNull();
    expect(parseCombined(42 as never)).toBeNull();
    expect(parseCombined(null as never)).toBeNull();
  });
});

describe('map-view.resolveMarker', () => {
  const cfg: IMapViewConfig = {
    tableId: 't',
    latFieldId: 'lat',
    lngFieldId: 'lng',
    labelFieldId: 'name',
    clusterRadius: 60,
    initialView: { center: { lat: 0, lng: 0 }, zoom: 4 },
  };
  it('reads lat + lng fields', () => {
    const m = resolveMarker({ id: 'r1', cells: { lat: 37.7, lng: -122.4, name: 'SF' } }, cfg);
    expect(m).toEqual({ recordId: 'r1', point: { lat: 37.7, lng: -122.4 }, label: 'SF' });
  });
  it('returns null for invalid coords', () => {
    expect(resolveMarker({ id: 'r2', cells: { lat: 'bad', lng: 0 } }, cfg)).toBeNull();
  });
  it('uses combined field when lat/lng not configured', () => {
    const combined: IMapViewConfig = {
      ...cfg,
      latFieldId: undefined,
      lngFieldId: undefined,
      combinedFieldId: 'pos',
      labelFieldId: undefined,
    };
    const m = resolveMarker({ id: 'r3', cells: { pos: '1,2' } }, combined);
    expect(m).toEqual({ recordId: 'r3', point: { lat: 1, lng: 2 } });
  });
});

describe('map-view.haversineKm', () => {
  it('computes distance between SF and NYC ~4129 km', () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const nyc = { lat: 40.7128, lng: -74.006 };
    const d = haversineKm(sf, nyc);
    expect(d).toBeGreaterThan(4100);
    expect(d).toBeLessThan(4160);
  });
  it('returns 0 for same point', () => {
    expect(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBeCloseTo(0, 6);
  });
});

describe('map-view.geoRegion', () => {
  it('countryOf returns US for California', () => {
    expect(countryOf({ lat: 36, lng: -119 })).toBe('US');
  });
  it('countryOf returns CN for Beijing', () => {
    expect(countryOf({ lat: 39.9, lng: 116.4 })).toBe('CN');
  });
  it('inBoundingBox works', () => {
    const bbox = { southWest: { lat: 30, lng: -130 }, northEast: { lat: 50, lng: -100 } };
    expect(inBoundingBox({ lat: 37, lng: -122 }, bbox)).toBe(true);
    expect(inBoundingBox({ lat: 60, lng: 0 }, bbox)).toBe(false);
  });
  it('inPolygon works', () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ];
    expect(inPolygon({ lat: 5, lng: 5 }, poly)).toBe(true);
    expect(inPolygon({ lat: 50, lng: 5 }, poly)).toBe(false);
  });
  it('inPolygon rejects degenerate polygon', () => {
    expect(
      inPolygon({ lat: 5, lng: 5 }, [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ])
    ).toBe(false);
  });
});

describe('map-view.applyRegionFilter', () => {
  const markers = [
    { recordId: 'a', point: { lat: 37, lng: -122 } },
    { recordId: 'b', point: { lat: 40, lng: -74 } },
    { recordId: 'c', point: { lat: 39.9, lng: 116.4 } },
  ];
  it('filters by country code', () => {
    const out = applyRegionFilter(markers, { countryCode: 'US' });
    expect(out).toHaveLength(2);
  });
  it('filters by bbox', () => {
    const out = applyRegionFilter(markers, {
      bbox: { southWest: { lat: 36, lng: -130 }, northEast: { lat: 45, lng: -100 } },
    });
    expect(out.map((m) => m.recordId)).toEqual(['a']);
  });
  it('filters by polygon', () => {
    const poly = [
      { lat: 30, lng: -130 },
      { lat: 30, lng: -100 },
      { lat: 50, lng: -100 },
      { lat: 50, lng: -130 },
    ];
    const out = applyRegionFilter(markers, { polygon: poly });
    expect(out.map((m) => m.recordId)).toEqual(['a']);
  });
});

describe('map-view.clusterMarkers', () => {
  it('clusters nearby markers', () => {
    const markers = [
      { recordId: 'a', point: { lat: 37, lng: -122 } },
      { recordId: 'b', point: { lat: 37.01, lng: -122.01 } },
      { recordId: 'c', point: { lat: 40, lng: -74 } },
    ];
    const clusters = clusterMarkers(markers, { radiusPx: 100, zoom: 5 });
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.count === 2);
    expect(big).toBeDefined();
  });
  it('skips clustering when radiusPx is 0', () => {
    const markers = [{ recordId: 'a', point: { lat: 37, lng: -122 } }];
    expect(clusterMarkers(markers, { radiusPx: 0 })).toEqual([]);
  });
  it('handles empty input', () => {
    expect(clusterMarkers([])).toEqual([]);
  });
});

describe('map-view.averagePoint', () => {
  it('returns origin for empty list', () => {
    expect(averagePoint([])).toEqual({ lat: 0, lng: 0 });
  });
  it('computes average', () => {
    expect(
      averagePoint([
        { lat: 10, lng: 20 },
        { lat: 20, lng: 40 },
      ])
    ).toEqual({ lat: 15, lng: 30 });
  });
});

describe('map-view.pixelsToKm', () => {
  it('decreases as zoom increases', () => {
    const low = pixelsToKm(60, 2);
    const high = pixelsToKm(60, 12);
    expect(low).toBeGreaterThan(high);
  });
});

describe('map-view.validateConfig', () => {
  const base: Partial<IMapViewConfig> = { tableId: 't', latFieldId: 'lat', lngFieldId: 'lng' };
  it('accepts valid config', () => {
    expect(validateConfig(base)).toBeNull();
  });
  it('requires tableId', () => {
    expect(validateConfig({})).toContain('tableId');
  });
  it('requires either lat/lng or combined', () => {
    expect(validateConfig({ tableId: 't' })).toContain('latFieldId');
  });
  it('rejects negative cluster radius', () => {
    expect(validateConfig({ ...base, clusterRadius: -1 })).toContain('clusterRadius');
  });
  it('rejects invalid initialView.center', () => {
    expect(
      validateConfig({ ...base, initialView: { center: { lat: 91, lng: 0 }, zoom: 4 } })
    ).toContain('initialView.center');
  });
  it('rejects out-of-range zoom', () => {
    expect(
      validateConfig({ ...base, initialView: { center: { lat: 0, lng: 0 }, zoom: 30 } })
    ).toContain('zoom');
  });
});
