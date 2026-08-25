import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildDependencyRow,
  buildTaskRow,
  buildTimelineViewRow,
  computeCriticalPath,
  detectCycle,
  isValidProgress,
} from './timeline-view.service';
import type {
  DependencyType,
  ICreateDependencyInput,
  ICreateTaskInput,
  ICreateTimelineViewInput,
  ICriticalPathResult,
  ITimelineDependency,
  ITimelineTask,
  ITimelineView,
} from './timeline-view.types';

@Injectable()
export class TimelineViewAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createView(input: ICreateTimelineViewInput): Promise<ITimelineView> {
    const id = `tlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildTimelineViewRow({ id, ...input });
    const created = await this.prisma.timelineView.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        tableId: row.tableId,
        name: row.name,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
        highlightCriticalPath: row.highlightCriticalPath,
        createdBy: row.createdBy,
      },
    });
    return toView(created);
  }

  async addTask(input: ICreateTaskInput): Promise<ITimelineTask> {
    if (input.parentTaskId) {
      const parent = await this.prisma.timelineTask.findUnique({
        where: { id: input.parentTaskId },
      });
      if (!parent) throw new NotFoundException(`parent task not found: ${input.parentTaskId}`);
      if (parent.tableId !== input.tableId) {
        throw new BadRequestException('parent task belongs to a different table');
      }
    }
    const id = `tlt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildTaskRow({ id, ...input });
    const created = await this.prisma.timelineTask.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        tableId: row.tableId,
        recordId: row.recordId,
        viewId: null,
        name: row.name,
        start: row.start,
        end: row.end,
        progress: row.progress,
        parentTaskId: row.parentTaskId,
      },
    });
    return toTask(created);
  }

  async addDependency(input: ICreateDependencyInput): Promise<ITimelineDependency> {
    const [task, pred] = await Promise.all([
      this.prisma.timelineTask.findUnique({ where: { id: input.taskId } }),
      this.prisma.timelineTask.findUnique({ where: { id: input.predecessorId } }),
    ]);
    if (!task) throw new NotFoundException(`task not found: ${input.taskId}`);
    if (!pred) throw new NotFoundException(`predecessor not found: ${input.predecessorId}`);
    if (task.tableId !== pred.tableId) {
      throw new BadRequestException('task and predecessor must live in the same table');
    }
    // Cycle guard: check whether adding this edge would close a loop.
    const existingDeps = await this.prisma.timelineDependency.findMany();
    const previewId = `tld_preview_${Date.now().toString(36)}`;
    const preview = buildDependencyRow({ id: previewId, ...input });
    const involvedTaskIds = new Set([
      ...existingDeps.flatMap((d) => [d.taskId, d.predecessorId]),
      input.taskId,
      input.predecessorId,
    ]);
    const involvedTasks = await this.prisma.timelineTask.findMany({
      where: { id: { in: [...involvedTaskIds] } },
    });
    const cycle = detectCycle(toTaskList(involvedTasks), [...toDepList(existingDeps), preview]);
    if (cycle) {
      throw new BadRequestException(`dependency cycle: ${cycle.join(' → ')}`);
    }
    const id = `tld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildDependencyRow({ id, ...input });
    const created = await this.prisma.timelineDependency.create({
      data: {
        id: row.id,
        taskId: row.taskId,
        predecessorId: row.predecessorId,
        type: row.type,
        lagDays: row.lagDays,
      },
    });
    return toDep(created);
  }

  async removeTask(taskId: string): Promise<void> {
    const existing = await this.prisma.timelineTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException(`task not found: ${taskId}`);
    await this.prisma.timelineDependency.deleteMany({
      where: { OR: [{ taskId }, { predecessorId: taskId }] },
    });
    await this.prisma.timelineTask.delete({ where: { id: taskId } });
  }

  async updateTaskProgress(taskId: string, progress: number): Promise<ITimelineTask> {
    if (!isValidProgress(progress)) throw new BadRequestException('progress out of [0,1]');
    const existing = await this.prisma.timelineTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException(`task not found: ${taskId}`);
    const updated = await this.prisma.timelineTask.update({
      where: { id: taskId },
      data: { progress },
    });
    return toTask(updated);
  }

  async computeCriticalPathForView(viewId: string): Promise<ICriticalPathResult> {
    const view = await this.prisma.timelineView.findUnique({ where: { id: viewId } });
    if (!view) throw new NotFoundException(`view not found: ${viewId}`);
    const [taskRows, depRows] = await Promise.all([
      this.prisma.timelineTask.findMany({ where: { tableId: view.tableId } }),
      this.prisma.timelineDependency.findMany({
        where: {
          taskId: {
            in: (
              await this.prisma.timelineTask.findMany({
                where: { tableId: view.tableId },
                select: { id: true },
              })
            ).map((t) => t.id),
          },
        },
      }),
    ]);
    return computeCriticalPath(toTaskList(taskRows), toDepList(depRows), view.windowStart);
  }

  async listTasks(viewId: string): Promise<ITimelineTask[]> {
    const view = await this.prisma.timelineView.findUnique({ where: { id: viewId } });
    if (!view) throw new NotFoundException(`view not found: ${viewId}`);
    const rows = await this.prisma.timelineTask.findMany({
      where: { tableId: view.tableId },
    });
    return rows.map(toTask);
  }

  computeCriticalPath = computeCriticalPath;
  detectCycle = detectCycle;
}

function toView(r: {
  id: string;
  baseId: string;
  tableId: string;
  name: string;
  windowStart: Date;
  windowEnd: Date;
  highlightCriticalPath: boolean;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): ITimelineView {
  return { ...r };
}

function toTask(r: {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  viewId: string | null;
  name: string;
  start: Date | null;
  end: Date | null;
  progress: number;
  parentTaskId: string | null;
}): ITimelineTask {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    recordId: r.recordId,
    name: r.name,
    start: r.start,
    end: r.end,
    progress: r.progress,
    parentTaskId: r.parentTaskId,
  };
}

function toDep(r: {
  id: string;
  taskId: string;
  predecessorId: string;
  type: string;
  lagDays: number;
}): ITimelineDependency {
  return {
    id: r.id,
    taskId: r.taskId,
    predecessorId: r.predecessorId,
    type: r.type as DependencyType,
    lagDays: r.lagDays,
  };
}

function toTaskList(rows: Array<Parameters<typeof toTask>[0]>): ITimelineTask[] {
  return rows.map(toTask);
}
function toDepList(rows: Array<Parameters<typeof toDep>[0]>): ITimelineDependency[] {
  return rows.map(toDep);
}
