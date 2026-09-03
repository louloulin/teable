/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import {
  CronParseError,
  nextFireAt,
  parseCron,
  runCronTick,
  shouldFire,
} from './billing-cron';

describe('billing-cron.parseCron', () => {
  it('parses "*/5 * * * *" (every 5 minutes)', () => {
    const s = parseCron('*/5 * * * *');
    expect(s.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(s.hours).toBeNull();
    expect(s.daysOfMonth).toBeNull();
  });

  it('parses "30 9 * * *" (9:30 daily)', () => {
    const s = parseCron('30 9 * * *');
    expect(s.minutes).toEqual([30]);
    expect(s.hours).toEqual([9]);
    expect(s.daysOfMonth).toBeNull();
  });

  it('parses "0 0 1 * *" (midnight on 1st of month)', () => {
    const s = parseCron('0 0 1 * *');
    expect(s.minutes).toEqual([0]);
    expect(s.hours).toEqual([0]);
    expect(s.daysOfMonth).toEqual([1]);
  });

  it('parses comma-separated lists', () => {
    const s = parseCron('0,15,45 * * * *');
    expect(s.minutes).toEqual([0, 15, 45]);
  });

  it('parses ranges', () => {
    const s = parseCron('0 9-12 * * *');
    expect(s.hours).toEqual([9, 10, 11, 12]);
  });

  it('rejects out-of-range values (CRON_PARSE_ERROR)', () => {
    expect(() => parseCron('60 * * * *')).toThrow(CronParseError);
    expect(() => parseCron('* 24 * * *')).toThrow(CronParseError);
    expect(() => parseCron('* * 32 * *')).toThrow(CronParseError);
  });

  it('rejects wrong field count', () => {
    expect(() => parseCron('* * *')).toThrow(CronParseError);
    expect(() => parseCron('* * * * * *')).toThrow(CronParseError);
  });
});

describe('billing-cron.shouldFire', () => {
  it('fires when minute matches and no hour/day filter', () => {
    const s = parseCron('*/15 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    expect(shouldFire({ schedule: s, now })).toBe(true);
  });

  it('does not fire when minute does not match', () => {
    const s = parseCron('*/15 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 7, 0));
    expect(shouldFire({ schedule: s, now })).toBe(false);
  });

  it('respects hour filter (30 9 * * *)', () => {
    const s = parseCron('30 9 * * *');
    expect(shouldFire({ schedule: s, now: new Date(Date.UTC(2026, 8, 3, 9, 30, 0)) })).toBe(true);
    expect(shouldFire({ schedule: s, now: new Date(Date.UTC(2026, 8, 3, 10, 30, 0)) })).toBe(false);
  });

  it('respects day-of-month filter (0 0 1 * *)', () => {
    const s = parseCron('0 0 1 * *');
    expect(shouldFire({ schedule: s, now: new Date(Date.UTC(2026, 8, 1, 0, 0, 0)) })).toBe(true);
    expect(shouldFire({ schedule: s, now: new Date(Date.UTC(2026, 8, 2, 0, 0, 0)) })).toBe(false);
  });

  it('does not double-fire within the same minute (lastFiredAt guard)', () => {
    const s = parseCron('*/5 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    const lastFiredAt = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    expect(shouldFire({ schedule: s, now, lastFiredAt })).toBe(false);
  });

  it('fires when lastFiredAt is in a previous minute', () => {
    const s = parseCron('*/5 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    const lastFiredAt = new Date(Date.UTC(2026, 8, 3, 12, 25, 0));
    expect(shouldFire({ schedule: s, now, lastFiredAt })).toBe(true);
  });
});

describe('billing-cron.nextFireAt', () => {
  it('returns the next minute matching the schedule', () => {
    const s = parseCron('*/15 * * * *');
    const after = new Date(Date.UTC(2026, 8, 3, 12, 7, 0));
    const next = nextFireAt(s, after)!;
    expect(next.getUTCMinutes()).toBe(15);
    expect(next.getUTCHours()).toBe(12);
  });

  it('rolls over to the next hour when needed', () => {
    const s = parseCron('0 * * * *');
    const after = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    const next = nextFireAt(s, after)!;
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCHours()).toBe(13);
  });

  it('returns the next Jan 1 occurrence for a monthly schedule', () => {
    const s = parseCron('0 0 1 * *'); // midnight on the 1st
    const after = new Date(Date.UTC(2026, 8, 3, 0, 0, 0)); // Sep 3
    const next = nextFireAt(s, after)!;
    expect(next.getUTCMonth()).toBe(9); // October (0-indexed)
    expect(next.getUTCDate()).toBe(1);
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('throws on invalid expressions (CRON_PARSE_ERROR)', () => {
    expect(() => parseCron('99 99 * * *')).toThrow(); // minute out of range
    expect(() => parseCron('not a cron')).toThrow(); // wrong field count
  });
});

describe('billing-cron.runCronTick', () => {
  it('runs handlers that should fire; ignores the rest', async () => {
    const s = parseCron('*/15 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    const fired: string[] = [];
    const out = await runCronTick({
      now,
      jobs: [
        { name: 'every-15', schedule: s, handler: () => { fired.push('every-15'); } },
        { name: 'skip', schedule: parseCron('0 9 * * *'), handler: () => { fired.push('skip'); } },
        { name: 'also-skip', schedule: parseCron('0 0 1 * *'), handler: () => { fired.push('also-skip'); } },
      ],
    });
    expect(out.fired).toEqual(['every-15']);
    expect(fired).toEqual(['every-15']);
  });

  it('handles async handlers', async () => {
    const s = parseCron('*/5 * * * *');
    const now = new Date(Date.UTC(2026, 8, 3, 12, 30, 0));
    let completed = false;
    await runCronTick({
      now,
      jobs: [
        {
          name: 'async',
          schedule: s,
          handler: async () => {
            await new Promise((r) => setTimeout(r, 5));
            completed = true;
          },
        },
      ],
    });
    expect(completed).toBe(true);
  });
});
