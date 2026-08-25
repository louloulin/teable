/**
 * Quota anomaly — NestJS auth service spec (Stage 78).
 */

import { QuotaAnomalyAuthService } from './quota-anomaly.auth.service';
import type { IAnomalyReport, IQuotaSample } from './quota-anomaly.types';

interface IPrismaMock {
  quotaSample: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  quotaAnomalyReport: {
    create: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    quotaSample: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    quotaAnomalyReport: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const baseSample = (over: Partial<IQuotaSample> = {}): IQuotaSample => ({
  orgId: 'o1',
  metric: 'apiCalls',
  endedAt: '2026-01-01T00:00:00Z',
  value: 100,
  cap: 1000,
  ...over,
});

describe('QuotaAnomalyAuthService.chooseChannels', () => {
  it('critical', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    expect(svc.chooseChannels('critical').sort()).toEqual(['email', 'inbox', 'webhook']);
  });
  it('warning', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    expect(svc.chooseChannels('warning').sort()).toEqual(['inbox', 'webhook']);
  });
  it('info', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    expect(svc.chooseChannels('info')).toEqual(['inbox']);
  });
});

describe('QuotaAnomalyAuthService.rowToSample', () => {
  it('parses', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    const s = svc.rowToSample({
      orgId: 'o1',
      metric: 'apiCalls',
      endedAt: new Date('2026-01-01T00:00:00Z'),
      value: 100,
      cap: 1000,
    });
    expect(s.value).toBe(100);
    expect(s.metric).toBe('apiCalls');
  });
});

describe('QuotaAnomalyAuthService.buildReportDirect', () => {
  it('builds', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    const r = svc.buildReportDirect({
      id: 'r1',
      sample: baseSample({ value: 950 }),
      median: 100,
      now: '2026-01-01T00:00:00Z',
    });
    expect(r.severity).toBe('critical');
  });
});

describe('QuotaAnomalyAuthService.materializeWindow', () => {
  it('builds window', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    const win = svc.materializeWindow({
      metric: 'apiCalls',
      durationMs: 3600_000,
      rows: [baseSample(), baseSample({ value: 200, endedAt: '2026-01-01T01:00:00Z' })],
    });
    expect(win.samples.length).toBe(2);
  });
});

describe('QuotaAnomalyAuthService.trimReports', () => {
  it('caps length', () => {
    const svc = new QuotaAnomalyAuthService(makePrisma() as never);
    const reports: IAnomalyReport[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      orgId: 'o1',
      metric: 'apiCalls',
      severity: 'warning',
      ratio: 2,
      capRatio: 0.7,
      channels: ['inbox'],
      detail: 'x',
      detectedAt: '2026-01-01T00:00:00Z',
    }));
    expect(svc.trimReports({ reports, cap: 2 }).length).toBe(2);
  });
});

describe('QuotaAnomalyAuthService.recordSample', () => {
  it('persists sample and emits report when critical', async () => {
    const prisma = makePrisma();
    (prisma.quotaSample.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        orgId: 'o1',
        metric: 'apiCalls',
        endedAt: new Date('2026-01-01T00:00:00Z'),
        value: 100,
        cap: 1000,
      },
      {
        orgId: 'o1',
        metric: 'apiCalls',
        endedAt: new Date('2026-01-01T01:00:00Z'),
        value: 950,
        cap: 1000,
      },
    ]);
    const svc = new QuotaAnomalyAuthService(prisma as never);
    const report = await svc.recordSample({
      sample: baseSample({ value: 200, endedAt: '2026-01-01T02:00:00Z' }),
      durationMs: 3600_000,
      reportId: 'r1',
      now: '2026-01-01T03:00:00Z',
    });
    expect(report).not.toBeNull();
    expect(prisma.quotaSample.create).toHaveBeenCalledTimes(1);
    expect(prisma.quotaAnomalyReport.create).toHaveBeenCalledTimes(1);
  });
  it('returns null when no anomaly', async () => {
    const prisma = makePrisma();
    (prisma.quotaSample.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        orgId: 'o1',
        metric: 'apiCalls',
        endedAt: new Date('2026-01-01T00:00:00Z'),
        value: 100,
        cap: 1000,
      },
    ]);
    const svc = new QuotaAnomalyAuthService(prisma as never);
    const report = await svc.recordSample({
      sample: baseSample({ value: 110, endedAt: '2026-01-01T01:00:00Z' }),
      durationMs: 3600_000,
      reportId: 'r1',
      now: '2026-01-01T02:00:00Z',
    });
    expect(report).toBeNull();
  });
});
