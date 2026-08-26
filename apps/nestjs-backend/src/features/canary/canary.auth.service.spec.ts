/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { CanaryAuthService } from './canary.auth.service';
import { computeCanaryLag, shouldTripCanary } from './canary.helpers';

interface IMockSettingTable {
  findFirst: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  setting: IMockSettingTable;
}

const buildPrisma = (): IMockPrisma => ({
  setting: {
    findFirst: vi.fn(),
  },
});

describe('CanaryAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: CanaryAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new CanaryAuthService(prisma as never);
  });

  it('tripCanary returns tripped=false when observed lag is below threshold', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce({
      lastModifiedTime: new Date('2026-08-25T00:00:00Z'),
      createdTime: new Date('2026-08-25T00:00:00Z'),
    });
    const out = await svc.tripCanary(new Date('2026-08-25T00:00:01Z'));
    expect(out.tripped).toBe(false);
    expect(out.observedLagMs).toBe(1_000);
  });

  it('tripCanary returns tripped=true when observed lag exceeds the 5s threshold', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce({
      lastModifiedTime: new Date('2026-08-25T00:00:00Z'),
      createdTime: new Date('2026-08-25T00:00:00Z'),
    });
    const out = await svc.tripCanary(new Date('2026-08-25T00:00:10Z'));
    expect(out.tripped).toBe(true);
    expect(out.reason).toBe('lag-exceeded');
  });

  it('tripCanary handles missing setting row by anchoring expectedAt to now', async () => {
    prisma.setting.findFirst.mockResolvedValueOnce(null);
    const now = new Date('2026-08-25T00:00:00Z');
    const out = await svc.tripCanary(now);
    expect(out.observedLagMs).toBe(0);
    expect(out.tripped).toBe(false);
  });
});

describe('canary helpers', () => {
  it('computeCanaryLag clamps negative diffs at zero', () => {
    const obs = new Date('2026-08-25T00:00:00Z');
    const exp = new Date('2026-08-25T00:00:05Z');
    expect(computeCanaryLag(obs, exp)).toBe(0);
    expect(computeCanaryLag(exp, obs)).toBe(5_000);
  });

  it('shouldTripCanary returns reason when threshold exceeded', () => {
    expect(shouldTripCanary(100, 50)).toEqual({
      tripped: true,
      reason: 'lag-exceeded',
      observedLagMs: 100,
      thresholdMs: 50,
    });
    expect(shouldTripCanary(10, 50)).toEqual({
      tripped: false,
      observedLagMs: 10,
      thresholdMs: 50,
    });
  });
});
