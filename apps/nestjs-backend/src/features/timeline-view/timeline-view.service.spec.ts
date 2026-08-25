/* eslint-disable @typescript-eslint/naming-convention */
import {
  addDays,
  buildDependencyRow,
  buildTaskRow,
  buildTimelineViewRow,
  computeCriticalPath,
  daysBetween,
  detectCycle,
  isValidDependencyType,
  isValidProgress,
  renderGanttBars,
  validateTimelineView,
} from './timeline-view.service';
import type { ITimelineDependency, ITimelineTask } from './timeline-view.types';
import { DEFAULT_PROGRESS } from './timeline-view.types';

const d = (iso: string) => new Date(iso);

describe('timeline view helpers (Stage 40)', () => {
  describe('isValidDependencyType / isValidProgress', () => {
    it('accepts the four FS/SS/FF/SF kinds', () => {
      for (const t of ['FS', 'SS', 'FF', 'SF']) {
        expect(isValidDependencyType(t)).toBe(true);
      }
      expect(isValidDependencyType('XX')).toBe(false);
    });
    it('progress must be in [0,1]', () => {
      expect(isValidProgress(0)).toBe(true);
      expect(isValidProgress(0.5)).toBe(true);
      expect(isValidProgress(1)).toBe(true);
      expect(isValidProgress(-0.01)).toBe(false);
      expect(isValidProgress(1.01)).toBe(false);
      expect(isValidProgress(Number.NaN)).toBe(false);
    });
  });

  describe('daysBetween / addDays', () => {
    it('counts whole-day diffs rounded', () => {
      expect(daysBetween(d('2026-01-01T00:00:00Z'), d('2026-01-04T00:00:00Z'))).toBe(3);
    });
    it('addDays advances by days', () => {
      const out = addDays(d('2026-01-01T00:00:00Z'), 5);
      expect(daysBetween(d('2026-01-01T00:00:00Z'), out)).toBe(5);
    });
  });

  describe('validateTimelineView', () => {
    it('throws when windowEnd < windowStart', () => {
      expect(() =>
        validateTimelineView({
          baseId: 'b',
          tableId: 't',
          name: 'V',
          windowStart: d('2026-05-01T00:00:00Z'),
          windowEnd: d('2026-04-01T00:00:00Z'),
          createdBy: 'u',
        })
      ).toThrow(/windowEnd/);
    });
    it('throws when name is empty', () => {
      expect(() =>
        validateTimelineView({
          baseId: 'b',
          tableId: 't',
          name: '   ',
          windowStart: d('2026-01-01T00:00:00Z'),
          windowEnd: d('2026-01-10T00:00:00Z'),
          createdBy: 'u',
        })
      ).toThrow(/name/);
    });
    it('throws when window span > 10 years', () => {
      expect(() =>
        validateTimelineView({
          baseId: 'b',
          tableId: 't',
          name: 'V',
          windowStart: d('2026-01-01T00:00:00Z'),
          windowEnd: d('2040-01-01T00:00:00Z'),
          createdBy: 'u',
        })
      ).toThrow(/span/);
    });
  });

  describe('buildTimelineViewRow', () => {
    it('defaults highlightCriticalPath to true', () => {
      const r = buildTimelineViewRow({
        id: 'v1',
        baseId: 'b',
        tableId: 't',
        name: 'V',
        windowStart: d('2026-01-01T00:00:00Z'),
        windowEnd: d('2026-02-01T00:00:00Z'),
        createdBy: 'u',
      });
      expect(r.highlightCriticalPath).toBe(true);
      expect(r.name).toBe('V');
    });
  });

  describe('buildTaskRow / buildDependencyRow', () => {
    it('buildTaskRow fills default progress', () => {
      const r = buildTaskRow({
        id: 't1',
        baseId: 'b',
        tableId: 't',
        recordId: 'r1',
        name: 'A',
        start: d('2026-01-01T00:00:00Z'),
        end: d('2026-01-05T00:00:00Z'),
      });
      expect(r.progress).toBe(DEFAULT_PROGRESS);
    });
    it('buildTaskRow rejects end < start', () => {
      expect(() =>
        buildTaskRow({
          id: 't1',
          baseId: 'b',
          tableId: 't',
          recordId: 'r1',
          name: 'A',
          start: d('2026-01-05T00:00:00Z'),
          end: d('2026-01-01T00:00:00Z'),
        })
      ).toThrow(/end/);
    });
    it('buildDependencyRow rejects self-deps', () => {
      expect(() =>
        buildDependencyRow({ id: 'd1', taskId: 'a', predecessorId: 'a', type: 'FS' })
      ).toThrow(/self/);
    });
    it('buildDependencyRow rejects unknown type', () => {
      expect(() =>
        buildDependencyRow({
          id: 'd1',
          taskId: 'a',
          predecessorId: 'b',
          type: 'XX' as never,
        })
      ).toThrow();
    });
  });

  describe('detectCycle', () => {
    const t = (id: string): ITimelineTask => ({
      id,
      baseId: 'b',
      tableId: 't',
      recordId: id,
      name: id,
      start: d('2026-01-01T00:00:00Z'),
      end: d('2026-01-02T00:00:00Z'),
      progress: 0,
      parentTaskId: null,
    });
    const dep = (a: string, b: string): ITimelineDependency =>
      buildDependencyRow({ id: `${a}->${b}`, taskId: a, predecessorId: b, type: 'FS' });
    it('returns null on a DAG', () => {
      expect(detectCycle([t('a'), t('b')], [dep('b', 'a')])).toBeNull();
    });
    it('returns the offending cycle', () => {
      const cycle = detectCycle(
        [t('a'), t('b'), t('c')],
        [dep('b', 'a'), dep('c', 'b'), dep('a', 'c')]
      );
      expect(cycle).not.toBeNull();
      expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
    });
  });

  describe('computeCriticalPath', () => {
    const t = (id: string, start: string, end: string): ITimelineTask => ({
      id,
      baseId: 'b',
      tableId: 't',
      recordId: id,
      name: id,
      start: d(start),
      end: d(end),
      progress: 0,
      parentTaskId: null,
    });
    const dep = (a: string, b: string, type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS', lag = 0) =>
      buildDependencyRow({ id: `${a}->${b}`, taskId: a, predecessorId: b, type, lagDays: lag });
    it('empty input → empty result', () => {
      expect(computeCriticalPath([], [], d('2026-01-01T00:00:00Z'))).toEqual({
        criticalTaskIds: [],
        projectDurationDays: 0,
        perTask: [],
      });
    });
    it('independent tasks are all critical when they finish at the same day', () => {
      const r = computeCriticalPath(
        [t('a', '2026-01-01', '2026-01-04'), t('b', '2026-01-01', '2026-01-04')],
        [],
        d('2026-01-01T00:00:00Z')
      );
      expect(r.criticalTaskIds.sort()).toEqual(['a', 'b']);
      expect(r.projectDurationDays).toBe(3);
    });
    it('FS chain of 3 yields 7-day duration', () => {
      const r = computeCriticalPath(
        [
          t('a', '2026-01-01', '2026-01-03'),
          t('b', '2026-01-04', '2026-01-06'),
          t('c', '2026-01-07', '2026-01-08'),
        ],
        [dep('b', 'a'), dep('c', 'b')],
        d('2026-01-01T00:00:00Z')
      );
      expect(r.projectDurationDays).toBe(7);
      // Calendar gaps (a→b = 1 day, b→c = 1 day) leave slack on a and b; only the tail is critical.
      expect(r.criticalTaskIds).toEqual(['c']);
    });
    it('chain drives projectEnd when parallel branch is shorter', () => {
      const r = computeCriticalPath(
        [
          t('a', '2026-01-01', '2026-01-03'), // 2 days
          t('b', '2026-01-03', '2026-01-06'), // 3 days, depends on a (no gap)
          t('c', '2026-01-02', '2026-01-05'), // 3-day independent parallel (shorter)
        ],
        [dep('b', 'a')],
        d('2026-01-01T00:00:00Z')
      );
      expect(r.criticalTaskIds.sort()).toEqual(['a', 'b']);
      expect(r.projectDurationDays).toBe(5);
      const cEntry = r.perTask.find((p) => p.taskId === 'c')!;
      expect(cEntry.slackDays).toBe(1);
    });
    it('throws on cycle', () => {
      expect(() =>
        computeCriticalPath(
          [t('a', '2026-01-01', '2026-01-02'), t('b', '2026-01-02', '2026-01-03')],
          [dep('b', 'a'), dep('a', 'b')],
          d('2026-01-01T00:00:00Z')
        )
      ).toThrow(/cycle/);
    });
    it('SS constraint respected', () => {
      // b must start ≥ start of a (both day-length)
      const r = computeCriticalPath(
        [t('a', '2026-01-05', '2026-01-06'), t('b', '2026-01-01', '2026-01-02')],
        [dep('b', 'a', 'SS')],
        d('2026-01-01T00:00:00Z')
      );
      const bEntry = r.perTask.find((p) => p.taskId === 'b')!;
      expect(bEntry.earliestStart.toISOString()).toContain('2026-01-05');
    });
    it('FF constraint respected', () => {
      // finish(b) ≤ finish(a)+lag; a finishes 2026-01-10
      const r = computeCriticalPath(
        [t('a', '2026-01-01', '2026-01-10'), t('b', '2026-01-01', '2026-01-03')],
        [dep('b', 'a', 'FF')],
        d('2026-01-01T00:00:00Z')
      );
      const bEntry = r.perTask.find((p) => p.taskId === 'b')!;
      expect(bEntry.latestFinish.toISOString()).toContain('2026-01-10');
    });
  });

  describe('renderGanttBars', () => {
    const t = (id: string, start: string, end: string): ITimelineTask => ({
      id,
      baseId: 'b',
      tableId: 't',
      recordId: id,
      name: id,
      start: d(start),
      end: d(end),
      progress: 0.5,
      parentTaskId: null,
    });
    it('skips tasks without dates', () => {
      const without: ITimelineTask = { ...t('x', '2026-01-01', '2026-01-02'), start: null };
      const bars = renderGanttBars([without], {
        criticalTaskIds: [],
        projectDurationDays: 0,
        perTask: [],
      });
      expect(bars).toEqual([]);
    });
    it('marks critical tasks', () => {
      const bars = renderGanttBars([t('a', '2026-01-01', '2026-01-02')], {
        criticalTaskIds: ['a'],
        projectDurationDays: 1,
        perTask: [],
      });
      expect(bars[0]?.isCritical).toBe(true);
    });
  });
});
