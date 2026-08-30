/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import {
  PrismaSubscriberLookup,
  RecordHistoryRetentionAuthService,
} from './record-history-retention.auth.service';
import type { ISubscriberContext } from './record-history-retention.types';

function mkPrismaMock(overrides: { space?: unknown; quota?: unknown } = {}) {
  const spaceFindFirst = vi.fn();
  const spaceQuotaFindUnique = vi.fn();
  const recordHistoryCount = vi.fn();
  const prisma = {
    space: { findFirst: spaceFindFirst },
    spaceQuota: { findUnique: spaceQuotaFindUnique },
    recordHistory: { count: recordHistoryCount },
  } as unknown as PrismaService;
  if (overrides.space !== undefined) {
    spaceFindFirst.mockResolvedValue(overrides.space);
  }
  spaceQuotaFindUnique.mockResolvedValue(overrides.quota ?? null);
  return { prisma, mocks: { spaceFindFirst, spaceQuotaFindUnique, recordHistoryCount } };
}

describe('PrismaSubscriberLookup', () => {
  it('returns null for unknown base', async () => {
    const { prisma, mocks } = mkPrismaMock({ space: null });
    const svc = new PrismaSubscriberLookup(prisma);
    const out = await svc.lookupSubscriber('missing');
    expect(out).toBeNull();
    expect(mocks.spaceFindFirst).toHaveBeenCalledWith({
      where: { id: 'missing' },
      select: { id: true, deletedTime: true },
    });
  });
  it('returns a default free-tier subscriber when base exists', async () => {
    const { prisma } = mkPrismaMock({
      space: { id: 'b1' },
      quota: { plan: 'business', recordHistoryDays: null },
    });
    const svc = new PrismaSubscriberLookup(prisma);
    const out = await svc.lookupSubscriber('b1');
    expect(out).toEqual({ tier: 'business' });
  });
});

describe('RecordHistoryRetentionAuthService', () => {
  it('resolves retention for a base via injected lookup', async () => {
    const { prisma } = mkPrismaMock();
    const subscriber = {
      async lookupSubscriber(_baseId: string): Promise<ISubscriberContext> {
        return { tier: 'pro' };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    const out = await svc.getRetention('b1');
    expect(out.baseId).toBe('b1');
    expect(out.resolved.tier).toBe('pro');
    expect(out.resolved.retentionDays).toBe(365);
    expect(out.purgeBefore).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('falls back to free tier when subscriber is unknown', async () => {
    const { prisma } = mkPrismaMock();
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext | null> {
        return null;
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    const out = await svc.getRetention('b-unknown');
    expect(out.resolved.tier).toBe('free');
    expect(out.resolved.retentionDays).toBe(14);
  });
  it('reports unlimited retention for enterprise override', async () => {
    const { prisma } = mkPrismaMock();
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext> {
        return { tier: 'free', enterpriseOverride: true };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    const out = await svc.getRetention('b-ent');
    expect(out.resolved.overridden).toBe(true);
    expect(Number.isFinite(out.resolved.retentionDays)).toBe(false);
  });
  it('withinRecordCap honours per-base soft cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.recordHistoryCount.mockResolvedValue(4_999);
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext> {
        return { tier: 'free' };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    expect(await svc.withinRecordCap('b-free')).toBe(true);
  });
  it('withinRecordCap refuses when at cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.recordHistoryCount.mockResolvedValue(5_001);
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext> {
        return { tier: 'free' };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    expect(await svc.withinRecordCap('b-free')).toBe(false);
  });
  it('withinRecordCap always allows when unlimited', async () => {
    const { prisma } = mkPrismaMock();
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext> {
        return { tier: 'enterprise' };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    expect(await svc.withinRecordCap('b-ent')).toBe(true);
  });
  it('describe returns human-readable summary', async () => {
    const { prisma } = mkPrismaMock();
    const subscriber = {
      async lookupSubscriber(): Promise<ISubscriberContext> {
        return { tier: 'business' };
      },
    };
    const svc = new RecordHistoryRetentionAuthService(prisma, subscriber);
    const text = await svc.describe('b-biz');
    expect(text).toContain('business tier');
    expect(text).toContain('1095');
  });
});
