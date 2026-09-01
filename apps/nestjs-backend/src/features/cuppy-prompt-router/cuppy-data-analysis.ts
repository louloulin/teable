export type AnalysisAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type AnalysisRecord = {
  fields?: Record<string, unknown>;
};

export type AnalysisRequest = {
  aggregation?: AnalysisAggregation;
  metricField?: string;
  groupByField?: string;
};

export type AnalysisResult = {
  aggregation: AnalysisAggregation;
  metricField?: string;
  groupByField?: string;
  totalRecords: number;
  numericRecords: number;
  value: number;
  groups: Array<{ key: string; count: number; value: number }>;
  chart: { type: 'bar' | 'number'; x?: string; y: string };
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const aggregate = (values: number[], aggregation: AnalysisAggregation): number => {
  if (aggregation === 'count') return values.length;
  if (values.length === 0) return 0;
  if (aggregation === 'sum' || aggregation === 'avg') {
    const total = values.reduce((sum, value) => sum + value, 0);
    return aggregation === 'avg' ? total / values.length : total;
  }
  return aggregation === 'min' ? Math.min(...values) : Math.max(...values);
};

export const analyzeRecords = (
  records: AnalysisRecord[],
  request: AnalysisRequest = {}
): AnalysisResult => {
  const aggregation = request.aggregation ?? (request.metricField ? 'sum' : 'count');
  const groups = new Map<string, { count: number; values: number[] }>();
  const allValues: number[] = [];

  for (const record of records) {
    const fields = record.fields ?? {};
    const key = request.groupByField
      ? String(fields[request.groupByField] ?? '(empty)')
      : '__all__';
    const group = groups.get(key) ?? { count: 0, values: [] };
    group.count += 1;
    if (request.metricField) {
      const value = toNumber(fields[request.metricField]);
      if (value !== undefined) {
        group.values.push(value);
        allValues.push(value);
      }
    }
    groups.set(key, group);
  }

  const resultGroups = [...groups.entries()].map(([key, group]) => ({
    key: key === '__all__' ? 'all' : key,
    count: group.count,
    value: aggregation === 'count' ? group.count : aggregate(group.values, aggregation),
  }));

  return {
    aggregation,
    ...(request.metricField ? { metricField: request.metricField } : {}),
    ...(request.groupByField ? { groupByField: request.groupByField } : {}),
    totalRecords: records.length,
    numericRecords: allValues.length,
    value: aggregation === 'count' ? records.length : aggregate(allValues, aggregation),
    groups: resultGroups,
    chart: request.groupByField
      ? { type: 'bar', x: request.groupByField, y: aggregation }
      : { type: 'number', y: aggregation },
  };
};
