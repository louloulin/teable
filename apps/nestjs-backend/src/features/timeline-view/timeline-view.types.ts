/**
 * Timeline / Gantt view — Stage 40 types.
 *
 * Per-task dependency edges + computed critical path. Tasks are
 * identified by tableId+recordId pairs; the view itself is a
 * composed layout that the front-end renders.
 */

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ITimelineTask {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  name: string;
  start: Date | null;
  end: Date | null;
  /** 0..1 — fraction of work done (used to draw the progress bar). */
  progress: number;
  /** Optional parent task id (for hierarchical Gantt sub-tasks). */
  parentTaskId: string | null;
}

export interface ITimelineDependency {
  id: string;
  taskId: string;
  predecessorId: string;
  type: DependencyType;
  /** Optional lag in days (positive) or lead in days (negative). */
  lagDays: number;
}

export interface ITimelineView {
  id: string;
  baseId: string;
  tableId: string;
  name: string;
  /// Earliest visible time (inclusive).
  windowStart: Date;
  /// Latest visible time (inclusive).
  windowEnd: Date;
  /// Whether to draw critical-path highlighting.
  highlightCriticalPath: boolean;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface ICriticalPathTask {
  taskId: string;
  earliestStart: Date;
  latestFinish: Date;
  slackDays: number;
}

export interface ICriticalPathResult {
  criticalTaskIds: ReadonlyArray<string>;
  /// Days from window start to the last finishing task.
  projectDurationDays: number;
  perTask: ReadonlyArray<ICriticalPathTask>;
}

export interface ICreateTimelineViewInput {
  baseId: string;
  tableId: string;
  name: string;
  windowStart: Date;
  windowEnd: Date;
  highlightCriticalPath?: boolean;
  createdBy: string;
}

export interface ICreateTaskInput {
  baseId: string;
  tableId: string;
  recordId: string;
  name: string;
  start: Date | null;
  end: Date | null;
  progress?: number;
  parentTaskId?: string | null;
}

export interface ICreateDependencyInput {
  taskId: string;
  predecessorId: string;
  type: DependencyType;
  lagDays?: number;
}

export const MS_PER_DAY = 86_400_000;
export const DEFAULT_PROGRESS = 0;
