/**
 * Quota anomaly — pure helpers spec (Stage 78).
 */

import {
  appendSample,
  buildReport,
  buildWindow,
  burstRatio,
  capChannels,
  capRatio,
  channelsForSeverity,
  evaluateWindow,
  isNotificationChannel,
  isQuotaMetric,
  medianValue,
  severityFromRatios,
  trimReports,
  validateSample,
} from './quota-anomaly.service';
import type { IQuotaSample } from './quota-anomaly.types';

const baseSample = (over: Partial<IQuotaSample> = {}): IQuotaSample => ({
  orgId: 'o1',
  metric: 'apiCalls',
  endedAt: '2026-01-01T00:00:00Z',
  value: 100,
  cap: 1000,
  ...over,
});

describe('quota-anomaly.isQuotaMetric', () => {
  it('accepts known', () => {
    expect(isQuotaMetric('apiCalls')).toBe(true);
    expect(isQuotaMetric('aiCredits')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isQuotaMetric('??')).toBe(false);
  });
});

describe('quota-anomaly.isNotificationChannel', () => {
  it('accepts known', () => {
    expect(isNotificationChannel('email')).toBe(true);
    expect(isNotificationChannel('slack')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isNotificationChannel('fax')).toBe(false);
  });
});

describe('quota-anomaly.validateSample', () => {
  it('passes a good sample', () => {
    expect(validateSample(baseSample())).toBeNull();
  });
  it('rejects missing orgId', () => {
    expect(validateSample(baseSample({ orgId: '' }))).toBe('orgId required');
  });
  it('rejects unknown metric', () => {
    expect(validateSample(baseSample({ metric: '??' as never }))).toContain('metric');
  });
  it('rejects negative value', () => {
    expect(validateSample(baseSample({ value: -1 }))).toContain('value');
  });
  it('rejects zero cap', () => {
    expect(validateSample(baseSample({ cap: 0 }))).toContain('cap');
  });
});

describe('quota-anomaly.appendSample', () => {
  it('appends and trims', () => {
    const win = buildWindow({ metric: 'apiCalls', durationMs: 3600_000 });
    let next = win;
    for (let i = 0; i < 70; i++) {
      next = appendSample({
        window: next,
        sample: baseSample({
          value: i,
          endedAt: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`,
        }),
      });
    }
    expect(next.samples.length).toBeLessThanOrEqual(64);
  });
});

describe('quota-anomaly.medianValue', () => {
  it('returns 0 for empty', () => {
    expect(medianValue([])).toBe(0);
  });
  it('returns middle for odd count', () => {
    expect(
      medianValue([baseSample({ value: 1 }), baseSample({ value: 2 }), baseSample({ value: 3 })])
    ).toBe(2);
  });
  it('returns average for even count', () => {
    expect(medianValue([baseSample({ value: 1 }), baseSample({ value: 3 })])).toBe(2);
  });
});

describe('quota-anomaly.capRatio', () => {
  it('divides by cap', () => {
    expect(capRatio(baseSample({ value: 700, cap: 1000 }))).toBeCloseTo(0.7);
  });
});

describe('quota-anomaly.burstRatio', () => {
  it('returns Infinity when median zero', () => {
    expect(burstRatio({ latest: baseSample({ value: 100 }), median: 0 })).toBe(Infinity);
  });
  it('returns 0 when both zero', () => {
    expect(burstRatio({ latest: baseSample({ value: 0 }), median: 0 })).toBe(0);
  });
  it('returns ratio', () => {
    expect(burstRatio({ latest: baseSample({ value: 300 }), median: 100 })).toBe(3);
  });
});

describe('quota-anomaly.severityFromRatios', () => {
  it('critical', () => {
    expect(severityFromRatios({ ratio: 5, cap: 0.95 })).toBe('critical');
    expect(severityFromRatios({ ratio: 1, cap: 0.95 })).toBe('critical');
    expect(severityFromRatios({ ratio: 5, cap: 0.5 })).toBe('critical');
  });
  it('warning', () => {
    expect(severityFromRatios({ ratio: 2, cap: 0.7 })).toBe('warning');
    expect(severityFromRatios({ ratio: 1, cap: 0.75 })).toBe('warning');
  });
  it('info', () => {
    expect(severityFromRatios({ ratio: 1, cap: 0.5 })).toBe('info');
  });
});

describe('quota-anomaly.channelsForSeverity', () => {
  it('critical gets all', () => {
    expect(channelsForSeverity('critical').sort()).toEqual(['email', 'inbox', 'webhook']);
  });
  it('warning gets inbox+webhook', () => {
    expect(channelsForSeverity('warning').sort()).toEqual(['inbox', 'webhook']);
  });
  it('info gets inbox', () => {
    expect(channelsForSeverity('info')).toEqual(['inbox']);
  });
});

describe('quota-anomaly.capChannels', () => {
  it('caps to max', () => {
    expect(capChannels(['email', 'inbox', 'webhook', 'slack', 'email']).length).toBeLessThanOrEqual(
      4
    );
  });
});

describe('quota-anomaly.buildReport', () => {
  it('builds a critical report', () => {
    const r = buildReport({
      id: 'r1',
      sample: baseSample({ value: 950, cap: 1000 }),
      median: 100,
      now: '2026-01-01T00:00:00Z',
    });
    expect(r.severity).toBe('critical');
    expect(r.capRatio).toBeCloseTo(0.95);
    expect(r.channels).toContain('email');
    expect(r.detail).toContain('metric=apiCalls');
  });
});

describe('quota-anomaly.evaluateWindow', () => {
  it('emits reports for warnings and criticals only', () => {
    const win = buildWindow({ metric: 'apiCalls', durationMs: 3600_000 });
    const populated = appendSample({
      window: win,
      sample: baseSample({ value: 100, endedAt: '2026-01-01T00:00:00Z' }),
    });
    const populated2 = appendSample({
      window: populated,
      sample: baseSample({ value: 800, endedAt: '2026-01-01T01:00:00Z' }),
    });
    const reports = evaluateWindow({
      window: populated2,
      idGen: (() => {
        let n = 0;
        return () => `r${++n}`;
      })(),
      now: '2026-01-01T02:00:00Z',
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports.every((r) => r.severity !== 'info')).toBe(true);
  });
});

describe('quota-anomaly.trimReports', () => {
  it('trims to cap', () => {
    const r = trimReports({
      reports: Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        orgId: 'o1',
        metric: 'apiCalls' as const,
        severity: 'warning' as const,
        ratio: 2,
        capRatio: 0.7,
        channels: ['inbox' as const],
        detail: 'x',
        detectedAt: '2026-01-01T00:00:00Z',
      })),
      cap: 4,
    });
    expect(r.length).toBe(4);
  });
});
