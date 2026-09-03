import { describe, expect, it } from 'vitest';
import { computePivot, MEASURE_FUNCTIONS } from './pivot-aggregation';

describe('computePivot', () => {
  const records = [
    { region: 'US', product: 'A', sales: 100 },
    { region: 'US', product: 'A', sales: 200 },
    { region: 'US', product: 'B', sales: 50 },
    { region: 'EU', product: 'A', sales: 300 },
    { region: 'EU', product: 'B', sales: 150 },
    { region: 'EU', product: 'B', sales: 250 },
  ];

  it('aggregates sum by row + column dimensions', () => {
    const result = computePivot(records, {
      rowFieldId: 'region',
      columnFieldId: 'product',
      measureFieldId: 'sales',
      measureFunction: 'sum',
    });

    expect(result.totalRecords).toBe(6);
    expect(result.rows.map((r) => r.value).sort()).toEqual(['EU', 'US']);
    expect(result.columns.map((c) => c.value).sort()).toEqual(['A', 'B']);
    // US/A: 100+200=300, US/B: 50, EU/A: 300, EU/B: 150+250=400
    const get = (r: string, c: string) => {
      const ri = result.rows.findIndex((x) => x.value === r);
      const ci = result.columns.findIndex((x) => x.value === c);
      return result.cells.get(`${ri}|${ci}` as `${number}|${number}`)?.value ?? null;
    };
    expect(get('US', 'A')).toBe(300);
    expect(get('US', 'B')).toBe(50);
    expect(get('EU', 'A')).toBe(300);
    expect(get('EU', 'B')).toBe(400);
  });

  it('computes count (records, not numeric)', () => {
    const result = computePivot(records, {
      rowFieldId: 'region',
      columnFieldId: 'product',
      measureFieldId: 'sales',
      measureFunction: 'count',
    });
    const get = (r: string, c: string) => {
      const ri = result.rows.findIndex((x) => x.value === r);
      const ci = result.columns.findIndex((x) => x.value === c);
      return result.cells.get(`${ri}|${ci}` as `${number}|${number}`)?.value ?? null;
    };
    // count counts all records in cell regardless of numeric measure
    expect(get('US', 'A')).toBe(2);
    expect(get('EU', 'B')).toBe(2);
  });

  it('computes avg', () => {
    const result = computePivot(records, {
      rowFieldId: 'region',
      columnFieldId: 'product',
      measureFieldId: 'sales',
      measureFunction: 'avg',
    });
    const get = (r: string, c: string) => {
      const ri = result.rows.findIndex((x) => x.value === r);
      const ci = result.columns.findIndex((x) => x.value === c);
      return result.cells.get(`${ri}|${ci}` as `${number}|${number}`)?.value ?? null;
    };
    expect(get('US', 'A')).toBe(150); // (100+200)/2
    expect(get('EU', 'B')).toBe(200); // (150+250)/2
  });

  it('computes min, max, median', () => {
    const recs = [
      { g: 'a', h: 'x', v: 5 },
      { g: 'a', h: 'x', v: 10 },
      { g: 'a', h: 'x', v: 15 },
    ];
    const minR = computePivot(recs, { rowFieldId: 'g', columnFieldId: 'h', measureFieldId: 'v', measureFunction: 'min' });
    const maxR = computePivot(recs, { rowFieldId: 'g', columnFieldId: 'h', measureFieldId: 'v', measureFunction: 'max' });
    const medR = computePivot(recs, { rowFieldId: 'g', columnFieldId: 'h', measureFieldId: 'v', measureFunction: 'median' });
    const get = (r: typeof minR) => r.cells.get(`0|0` as `${number}|${number}`)?.value ?? null;
    expect(get(minR)).toBe(5);
    expect(get(maxR)).toBe(15);
    expect(get(medR)).toBe(10);
  });

  it('handles null / non-numeric measure values gracefully', () => {
    const recs = [
      { region: 'US', product: 'A', sales: 100 },
      { region: 'US', product: 'A', sales: null },
      { region: 'US', product: 'A', sales: 'oops' as unknown as number },
    ];
    const result = computePivot(recs, {
      rowFieldId: 'region',
      columnFieldId: 'product',
      measureFieldId: 'sales',
      measureFunction: 'sum',
    });
    const ri = result.rows.findIndex((x) => x.value === 'US');
    const ci = result.columns.findIndex((x) => x.value === 'A');
    const cell = result.cells.get(`${ri}|${ci}` as `${number}|${number}`);
    expect(cell?.value).toBe(100); // only the one numeric value
    expect(cell?.count).toBe(3); // count tracks raw record count
  });

  it('hides empty groups by default', () => {
    const recs = [
      { region: 'US', product: 'A', sales: 1 },
      { region: 'EU', product: 'B', sales: 2 },
    ];
    const result = computePivot(recs, {
      rowFieldId: 'region',
      columnFieldId: 'product',
      measureFieldId: 'sales',
      measureFunction: 'sum',
    });
    expect(result.rows.map((r) => r.value).sort()).toEqual(['EU', 'US']);
    expect(result.columns.map((c) => c.value).sort()).toEqual(['A', 'B']);
  });

  it('exposes the canonical measure function list', () => {
    expect(MEASURE_FUNCTIONS).toEqual(['sum', 'avg', 'count', 'min', 'max', 'median']);
  });
});
