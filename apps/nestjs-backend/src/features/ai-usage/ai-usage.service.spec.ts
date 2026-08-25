/* eslint-disable @typescript-eslint/naming-convention */
import {
  bucketKey,
  exceedsModelCap,
  foldRecords,
  mergePerModelCap,
  normalizeAction,
  normalizeModel,
  parsePerModelCap,
  summarize,
} from './ai-usage.service';
import type { IAiUsageBucket, IRecordUsageInput } from './ai-usage.types';

const record = (over: Partial<IRecordUsageInput>): IRecordUsageInput => ({
  organizationId: 'org_1',
  model: 'gpt-4o-mini',
  action: 'completion',
  credits: 100,
  monthBucket: '2026-08',
  ...over,
});

describe('AI usage helpers (Stage 29)', () => {
  describe('normalizeModel / normalizeAction', () => {
    it('lowercases and trims; empty becomes "unknown"', () => {
      expect(normalizeModel('  GPT-4O ')).toBe('gpt-4o');
      expect(normalizeModel('')).toBe('unknown');
      expect(normalizeModel(null as never)).toBe('unknown');
    });
    it('lowercases and trims action', () => {
      expect(normalizeAction('Embedding')).toBe('embedding');
      expect(normalizeAction('')).toBe('unknown');
    });
  });

  describe('bucketKey', () => {
    it('joins fields with a non-printable separator', () => {
      const k = bucketKey({
        organizationId: 'o1',
        model: 'm1',
        action: 'a1',
        monthBucket: '2026-08',
      });
      expect(k).toContain('');
      expect(k.split('')).toEqual(['o1', 'm1', 'a1', '2026-08']);
    });
  });

  describe('foldRecords', () => {
    it('aggregates identical (org, model, action, month) records', () => {
      const out = foldRecords([
        record({ credits: 100 }),
        record({ credits: 200 }),
        record({ model: 'gpt-4o', credits: 50 }),
        record({ action: 'embedding', credits: 30 }),
      ]);
      expect(out).toHaveLength(3);
      const main = out.find((b) => b.model === 'gpt-4o-mini' && b.action === 'completion')!;
      expect(main.credits).toBe(300);
      expect(main.eventCount).toBe(2);
    });

    it('defaults monthBucket to "now" when not provided', () => {
      const out = foldRecords([{ organizationId: 'o1', model: 'm', action: 'a', credits: 5 }]);
      expect(out[0].monthBucket).toMatch(/^\d{4}-\d{2}$/);
    });

    it('handles empty input', () => {
      expect(foldRecords([])).toEqual([]);
    });
  });

  describe('summarize', () => {
    const buckets: IAiUsageBucket[] = [
      {
        id: '1',
        organizationId: 'org_1',
        model: 'gpt-4o-mini',
        action: 'completion',
        credits: 500,
        eventCount: 3,
        monthBucket: '2026-08',
        updatedTime: new Date(),
      },
      {
        id: '2',
        organizationId: 'org_1',
        model: 'gpt-4o-mini',
        action: 'embedding',
        credits: 200,
        eventCount: 10,
        monthBucket: '2026-08',
        updatedTime: new Date(),
      },
      {
        id: '3',
        organizationId: 'org_1',
        model: 'claude-haiku-4-5',
        action: 'completion',
        credits: 800,
        eventCount: 5,
        monthBucket: '2026-08',
        updatedTime: new Date(),
      },
      {
        id: '4',
        organizationId: 'org_1',
        model: 'gpt-4o',
        action: 'completion',
        credits: 999,
        eventCount: 1,
        monthBucket: '2026-09',
        updatedTime: new Date(),
      },
    ];

    it('totals credits and groups by model/action', () => {
      const s = summarize({ organizationId: 'org_1', monthBucket: '2026-08', buckets });
      expect(s.total).toBe(1500);
      expect(s.byModel).toEqual([
        { model: 'claude-haiku-4-5', credits: 800, events: 5 },
        { model: 'gpt-4o-mini', credits: 700, events: 13 },
      ]);
      expect(s.byAction).toEqual([
        { action: 'completion', credits: 1300, events: 8 },
        { action: 'embedding', credits: 200, events: 10 },
      ]);
    });

    it('ignores buckets outside the target month or org', () => {
      const s = summarize({ organizationId: 'org_1', monthBucket: '2026-09', buckets });
      expect(s.total).toBe(999);
      expect(s.byModel).toHaveLength(1);
    });
  });

  describe('exceedsModelCap', () => {
    const bucket: IAiUsageBucket = {
      id: 'b',
      organizationId: 'o',
      model: 'gpt-4o-mini',
      action: 'completion',
      credits: 800,
      eventCount: 1,
      monthBucket: '2026-08',
      updatedTime: new Date(),
    };

    it('returns false when no cap configured', () => {
      expect(exceedsModelCap({ bucket, estimatedCredits: 1000, perModelCap: {} })).toBe(false);
    });

    it('returns false when within the cap', () => {
      expect(
        exceedsModelCap({
          bucket,
          estimatedCredits: 100,
          perModelCap: { 'gpt-4o-mini': 1000 },
        })
      ).toBe(false);
    });

    it('returns true when estimate exceeds cap', () => {
      expect(
        exceedsModelCap({
          bucket,
          estimatedCredits: 300,
          perModelCap: { 'gpt-4o-mini': 1000 },
        })
      ).toBe(true);
    });
  });

  describe('parsePerModelCap / mergePerModelCap', () => {
    it('parses valid JSON', () => {
      expect(parsePerModelCap('{"gpt-4o-mini": 1000}')).toEqual({ 'gpt-4o-mini': 1000 });
    });

    it('lowercases keys + drops invalid entries', () => {
      expect(mergePerModelCap({ '  GPT-4O ': 100, foo: -1, bar: 0, baz: 'x' as never })).toEqual({
        'gpt-4o': 100,
        bar: 0,
      });
    });

    it('returns {} for invalid JSON', () => {
      expect(parsePerModelCap('not json')).toEqual({});
      expect(parsePerModelCap(null)).toEqual({});
      expect(parsePerModelCap('[]')).toEqual({});
    });
  });
});
