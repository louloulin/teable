/**
 * Timeline view — Stage 40.
 *
 * Pure helpers: date-range validation, dependency cycle detection,
 * FS/SS/FF/SF predecessor constraint evaluation, and a forward /
 * backward pass critical-path computation.
 */

import type {
  ICriticalPathResult,
  ICriticalPathTask,
  ICreateTaskInput,
  ICreateTimelineViewInput,
  DependencyType,
  ITimelineDependency,
  ITimelineTask,
  ITimelineView,
} from './timeline-view.types';
import { DEFAULT_PROGRESS, MS_PER_DAY } from './timeline-view.types';

export function isValidDependencyType(d: string): d is DependencyType {
  return d === 'FS' || d === 'SS' || d === 'FF' || d === 'SF';
}

export function isValidProgress(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 1;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function validateTimelineView(input: ICreateTimelineViewInput): void {
  if (input.windowEnd.getTime() < input.windowStart.getTime()) {
    throw new Error('windowEnd must be ≥ windowStart');
  }
  if (input.name.trim().length === 0) throw new Error('view name required');
  const span = daysBetween(input.windowStart, input.windowEnd);
  if (span < 0 || span > 365 * 10) throw new Error('window span out of range');
}

export function buildTimelineViewRow(
  input: ICreateTimelineViewInput & { id: string }
): ITimelineView {
  validateTimelineView(input);
  return {
    id: input.id,
    baseId: input.baseId,
    tableId: input.tableId,
    name: input.name,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    highlightCriticalPath: input.highlightCriticalPath ?? true,
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}

export function buildTaskRow(input: ICreateTaskInput & { id: string }): ITimelineTask {
  if (input.start && input.end && input.end.getTime() < input.start.getTime()) {
    throw new Error('task end must be ≥ start');
  }
  if (input.progress !== undefined && !isValidProgress(input.progress)) {
    throw new Error('progress out of [0,1]');
  }
  return {
    id: input.id,
    baseId: input.baseId,
    tableId: input.tableId,
    recordId: input.recordId,
    name: input.name,
    start: input.start,
    end: input.end,
    progress: input.progress ?? DEFAULT_PROGRESS,
    parentTaskId: input.parentTaskId ?? null,
  };
}

export function buildDependencyRow(input: {
  id: string;
  taskId: string;
  predecessorId: string;
  type: DependencyType;
  lagDays?: number;
}): ITimelineDependency {
  if (input.taskId === input.predecessorId) throw new Error('self-dependency');
  if (!isValidDependencyType(input.type)) throw new Error('invalid dependency type');
  return {
    id: input.id,
    taskId: input.taskId,
    predecessorId: input.predecessorId,
    type: input.type,
    lagDays: input.lagDays ?? 0,
  };
}

/** Detect dependency cycles via DFS. Returns the offending cycle, or null. */
export function detectCycle(
  tasks: ReadonlyArray<ITimelineTask>,
  deps: ReadonlyArray<ITimelineDependency>
): ReadonlyArray<string> | null {
  const out = new Map<string, string[]>();
  for (const t of tasks) out.set(t.id, []);
  for (const d of deps) {
    if (!out.has(d.taskId)) out.set(d.taskId, []);
    out.get(d.taskId)!.push(d.predecessorId);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];
  function dfs(n: string): string[] | null {
    if (stack.has(n)) {
      const i = path.indexOf(n);
      return path.slice(i).concat(n);
    }
    if (visited.has(n)) return null;
    visited.add(n);
    stack.add(n);
    path.push(n);
    for (const m of out.get(n) ?? []) {
      const c = dfs(m);
      if (c) return c;
    }
    stack.delete(n);
    path.pop();
    return null;
  }
  for (const t of tasks) {
    const c = dfs(t.id);
    if (c) return c;
  }
  return null;
}

interface ITaskTiming {
  task: ITimelineTask;
  durationDays: number;
  earliestStart: Date;
  earliestFinish: Date;
  latestStart: Date;
  latestFinish: Date;
  slackDays: number;
  isCritical: boolean;
}

/**
 * Compute the critical path on a list of tasks + dependencies.
 *  - Duration defaults to 1 day when start === end.
 *  - Missing start/end → that task is skipped.
 *  - FS: finish of predecessor + lag ≤ start of this task.
 *  - SS: start of predecessor + lag ≤ start of this task.
 *  - FF: finish of predecessor + lag ≤ finish of this task.
 *  - SF: start of predecessor + lag ≤ finish of this task.
 */
export function computeCriticalPath(
  tasks: ReadonlyArray<ITimelineTask>,
  deps: ReadonlyArray<ITimelineDependency>,
  windowStart: Date
): ICriticalPathResult {
  const cycle = detectCycle(tasks, deps);
  if (cycle) throw new Error(`dependency cycle: ${cycle.join(' → ')}`);
  const usable = tasks.filter((t) => t.start !== null && t.end !== null) as Array<
    ITimelineTask & { start: Date; end: Date }
  >;
  if (usable.length === 0) {
    return { criticalTaskIds: [], projectDurationDays: 0, perTask: [] };
  }
  const durations = new Map<string, number>();
  for (const t of usable) durations.set(t.id, Math.max(1, daysBetween(t.start, t.end)));

  const { earliestStart, earliestFinish } = forwardPass(usable, deps, durations, windowStart);
  const projectEndTs = maxTs(earliestFinish.values());
  const reverseOrder = topologicalReverseOrder(usable, deps);
  const { latestFinish } = backwardPass(usable, deps, durations, reverseOrder, projectEndTs);

  const perTask: ICriticalPathTask[] = [];
  const criticalIds: string[] = [];
  for (const t of usable) {
    const es = earliestStart.get(t.id)!;
    const lf = latestFinish.get(t.id)!;
    const slackDays = Math.max(0, daysBetween(es, lf) - durations.get(t.id)!);
    if (slackDays === 0) criticalIds.push(t.id);
    perTask.push({ taskId: t.id, earliestStart: es, latestFinish: lf, slackDays });
  }
  const projectDurationDays = Math.max(
    0,
    Math.round((projectEndTs - windowStart.getTime()) / MS_PER_DAY)
  );
  return { criticalTaskIds: criticalIds, projectDurationDays, perTask };
}

type UsableTask = ITimelineTask & { start: Date; end: Date };

function forwardPass(
  usable: ReadonlyArray<UsableTask>,
  deps: ReadonlyArray<ITimelineDependency>,
  durations: ReadonlyMap<string, number>,
  windowStart: Date
): { earliestStart: Map<string, Date>; earliestFinish: Map<string, Date> } {
  const predByTask = new Map<string, ITimelineDependency[]>();
  for (const t of usable) predByTask.set(t.id, []);
  for (const d of deps) {
    if (predByTask.has(d.taskId)) predByTask.get(d.taskId)!.push(d);
  }
  const earliestStart = new Map<string, Date>();
  const earliestFinish = new Map<string, Date>();
  const remaining = new Set(usable.map((t) => t.id));
  const windowStartTs = windowStart.getTime();
  while (remaining.size > 0) {
    const progressed = forwardIteration(
      usable,
      remaining,
      predByTask,
      durations,
      earliestStart,
      earliestFinish,
      windowStartTs
    );
    if (!progressed) {
      for (const id of remaining) {
        const t = usable.find((x) => x.id === id)!;
        const es = new Date(Math.max(windowStartTs, t.start.getTime()));
        const ef = addDays(es, durations.get(id)!);
        earliestStart.set(id, es);
        earliestFinish.set(id, ef);
      }
      remaining.clear();
    }
  }
  return { earliestStart, earliestFinish };
}

function forwardIteration(
  usable: ReadonlyArray<UsableTask>,
  remaining: Set<string>,
  predByTask: ReadonlyMap<string, ITimelineDependency[]>,
  durations: ReadonlyMap<string, number>,
  earliestStart: Map<string, Date>,
  earliestFinish: Map<string, Date>,
  windowStartTs: number
): boolean {
  let progress = false;
  for (const id of [...remaining]) {
    const t = usable.find((x) => x.id === id)!;
    const anchor = resolveForwardAnchor(id, predByTask, earliestStart, earliestFinish, durations);
    if (anchor === undefined) continue;
    const es = anchor
      ? new Date(Math.max(anchor.getTime(), t.start.getTime()))
      : new Date(Math.max(windowStartTs, t.start.getTime()));
    const ef = addDays(es, durations.get(id)!);
    earliestStart.set(id, es);
    earliestFinish.set(id, ef);
    remaining.delete(id);
    progress = true;
  }
  return progress;
}

function resolveForwardAnchor(
  taskId: string,
  predByTask: ReadonlyMap<string, ITimelineDependency[]>,
  earliestStart: ReadonlyMap<string, Date>,
  earliestFinish: ReadonlyMap<string, Date>,
  durations: ReadonlyMap<string, number>
): Date | null | undefined {
  const preds = predByTask.get(taskId) ?? [];
  let anchor: Date | null = null;
  for (const d of preds) {
    if (!earliestFinish.has(d.predecessorId) && !earliestStart.has(d.predecessorId)) {
      return undefined;
    }
    const cand = applyConstraint(d, earliestStart, earliestFinish, durations);
    if (anchor === null || cand.getTime() > anchor.getTime()) anchor = cand;
  }
  return anchor;
}

function maxTs(values: IterableIterator<Date>): number {
  let max = 0;
  for (const v of values) max = Math.max(max, v.getTime());
  return max;
}

function topologicalReverseOrder(
  usable: ReadonlyArray<UsableTask>,
  deps: ReadonlyArray<ITimelineDependency>
): string[] {
  const inDeg = new Map<string, number>();
  const predsMap = new Map<string, string[]>();
  for (const t of usable) {
    inDeg.set(t.id, 0);
    predsMap.set(t.id, []);
  }
  for (const d of deps) {
    inDeg.set(d.taskId, (inDeg.get(d.taskId) ?? 0) + 1);
    if (predsMap.has(d.predecessorId)) predsMap.get(d.predecessorId)!.push(d.taskId);
  }
  const forwardOrder: string[] = [];
  const q: string[] = [];
  for (const t of usable) if (inDeg.get(t.id) === 0) q.push(t.id);
  while (q.length > 0) {
    const id = q.shift()!;
    forwardOrder.push(id);
    for (const s of predsMap.get(id) ?? []) {
      inDeg.set(s, inDeg.get(s)! - 1);
      if (inDeg.get(s) === 0) q.push(s);
    }
  }
  return forwardOrder.slice().reverse();
}

function backwardPass(
  usable: ReadonlyArray<UsableTask>,
  deps: ReadonlyArray<ITimelineDependency>,
  durations: ReadonlyMap<string, number>,
  reverseOrder: ReadonlyArray<string>,
  projectEndTs: number
): { latestStart: Map<string, Date>; latestFinish: Map<string, Date> } {
  const succByTask = new Map<string, ITimelineDependency[]>();
  for (const t of usable) succByTask.set(t.id, []);
  for (const d of deps) {
    if (succByTask.has(d.predecessorId)) succByTask.get(d.predecessorId)!.push(d);
  }
  const latestStart = new Map<string, Date>();
  const latestFinish = new Map<string, Date>();
  for (const t of usable) latestFinish.set(t.id, new Date(projectEndTs));
  for (let iter = 0; iter <= usable.length; iter++) {
    let changed = false;
    for (const id of reverseOrder) {
      const t = usable.find((x) => x.id === id)!;
      const succs = succByTask.get(t.id) ?? [];
      const earliestOfLatest = resolveBackwardLatest(
        t.id,
        succs,
        latestStart,
        latestFinish,
        durations
      );
      const lf = new Date(earliestOfLatest ?? projectEndTs);
      const dur = durations.get(t.id)!;
      const ls = addDays(lf, -dur);
      if (lf.getTime() !== latestFinish.get(t.id)!.getTime()) {
        latestFinish.set(t.id, lf);
        latestStart.set(t.id, ls);
        changed = true;
      } else {
        latestStart.set(t.id, ls);
      }
    }
    if (!changed) break;
  }
  return { latestStart, latestFinish };
}

function resolveBackwardLatest(
  taskId: string,
  succs: ReadonlyArray<ITimelineDependency>,
  latestStart: ReadonlyMap<string, Date>,
  latestFinish: ReadonlyMap<string, Date>,
  durations: ReadonlyMap<string, number>
): number | null {
  let earliestOfLatest: number | null = null;
  const dur = durations.get(taskId)!;
  for (const d of succs) {
    const succLS = latestStart.get(d.taskId);
    if (!succLS) continue;
    let constraint: number;
    const lagMs = (d.lagDays ?? 0) * MS_PER_DAY;
    switch (d.type) {
      case 'FS':
        constraint = succLS.getTime() - lagMs;
        break;
      case 'SS':
        constraint = succLS.getTime() - dur * MS_PER_DAY - lagMs;
        break;
      case 'FF':
        constraint = latestFinish.get(d.taskId)!.getTime() - lagMs;
        break;
      case 'SF':
        constraint = latestFinish.get(d.taskId)!.getTime() - dur * MS_PER_DAY - lagMs;
        break;
    }
    if (earliestOfLatest === null || constraint < earliestOfLatest) earliestOfLatest = constraint;
  }
  return earliestOfLatest;
}

function applyConstraint(
  d: ITimelineDependency,
  earliestStart: ReadonlyMap<string, Date>,
  earliestFinish: ReadonlyMap<string, Date>,
  durations: ReadonlyMap<string, number>
): Date {
  const lagMs = (d.lagDays ?? 0) * MS_PER_DAY;
  switch (d.type) {
    case 'FS':
      return new Date(earliestFinish.get(d.predecessorId)!.getTime() + lagMs);
    case 'SS':
      return new Date(earliestStart.get(d.predecessorId)!.getTime() + lagMs);
    case 'FF':
      return new Date(
        earliestFinish.get(d.predecessorId)!.getTime() -
          durations.get(d.taskId)! * MS_PER_DAY +
          lagMs
      );
    case 'SF':
      return new Date(
        earliestStart.get(d.predecessorId)!.getTime() -
          durations.get(d.taskId)! * MS_PER_DAY +
          lagMs
      );
  }
}

/** A simple M-P JSON shape the front-end can render directly. */
export interface IGanttBar {
  taskId: string;
  name: string;
  startIso: string;
  endIso: string;
  progress: number;
  isCritical: boolean;
}

export function renderGanttBars(
  tasks: ReadonlyArray<ITimelineTask>,
  critical: ICriticalPathResult
): IGanttBar[] {
  const critSet = new Set(critical.criticalTaskIds);
  return tasks
    .filter((t) => t.start !== null && t.end !== null)
    .map((t) => ({
      taskId: t.id,
      name: t.name,
      startIso: (t as ITimelineTask & { start: Date }).start.toISOString(),
      endIso: (t as ITimelineTask & { end: Date }).end.toISOString(),
      progress: t.progress,
      isCritical: critSet.has(t.id),
    }));
}

export const DEPENDENCY_TYPES: ReadonlyArray<DependencyType> = ['FS', 'SS', 'FF', 'SF'];

export type { ITaskTiming };
