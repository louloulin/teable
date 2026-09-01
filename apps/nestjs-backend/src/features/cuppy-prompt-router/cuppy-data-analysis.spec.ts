import { describe, expect, it } from 'vitest';
import { analyzeRecords } from './cuppy-data-analysis';

const sample = [
  { fields: { region: 'us', amount: 100 } },
  { fields: { region: 'us', amount: 200 } },
  { fields: { region: 'eu', amount: 50 } },
  { fields: { region: 'eu', amount: '150' } },
  { fields: { region: 'apac', amount: 'invalid' } },
];

describe('analyzeRecords', () => {
  it('defaults to count when no metric or aggregation is provided', () => {
    const result = analyzeRecords(sample);
    expect(result.aggregation).toBe('count');
    expect(result.value).toBe(5);
    expect(result.numericRecords).toBe(0);
    expect(result.chart.type).toBe('number');
    expect(result.groups).toEqual([{ key: 'all', count: 5, value: 5 }]);
  });

  it('sums a numeric metric and parses numeric strings', () => {
    const result = analyzeRecords(sample, { metricField: 'amount' });
    expect(result.aggregation).toBe('sum');
    expect(result.value).toBe(500);
    expect(result.numericRecords).toBe(4);
    expect(result.metricField).toBe('amount');
  });

  it('computes averages and min/max', () => {
    expect(analyzeRecords(sample, { metricField: 'amount', aggregation: 'avg' }).value).toBe(125);
    expect(analyzeRecords(sample, { metricField: 'amount', aggregation: 'min' }).value).toBe(50);
    expect(analyzeRecords(sample, { metricField: 'amount', aggregation: 'max' }).value).toBe(200);
  });

  it('groups by a dimension and emits a bar chart spec', () => {
    const result = analyzeRecords(sample, {
      metricField: 'amount',
      aggregation: 'sum',
      groupByField: 'region',
    });
    expect(result.groupByField).toBe('region');
    expect(result.chart).toEqual({ type: 'bar', x: 'region', y: 'sum' });
    const us = result.groups.find((g) => g.key === 'us');
    const eu = result.groups.find((g) => g.key === 'eu');
    expect(us?.value).toBe(300);
    expect(eu?.value).toBe(200);
  });

  it('treats missing group values as a stable bucket', () => {
    const result = analyzeRecords([{ fields: {} }, { fields: { region: 'us' } }], {
      groupByField: 'region',
    });
    const empty = result.groups.find((g) => g.key === '(empty)');
    expect(empty?.count).toBe(1);
  });

  it('returns zero for empty input without throwing', () => {
    expect(analyzeRecords([], { metricField: 'amount', aggregation: 'sum' })).toMatchObject({
      totalRecords: 0,
      numericRecords: 0,
      value: 0,
    });
  });
});
