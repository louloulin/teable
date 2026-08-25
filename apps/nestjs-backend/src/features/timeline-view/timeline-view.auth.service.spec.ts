/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { TimelineViewAuthService } from './timeline-view.auth.service';

interface IMockTask {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockDep {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockView {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  timelineTask: IMockTask;
  timelineDependency: IMockDep;
  timelineView: IMockView;
}

const buildPrisma = (): IMockPrisma => ({
  timelineTask: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      viewId: data.viewId ?? null,
    })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
  },
  timelineDependency: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  timelineView: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    findUnique: vi.fn(async () => null),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new TimelineViewAuthService(prisma as never);
  return { svc, prisma };
};

describe('TimelineViewAuthService (Stage 40)', () => {
  it('createView persists a view', async () => {
    const { svc, prisma } = buildSvc();
    const v = await svc.createView({
      baseId: 'b',
      tableId: 't',
      name: 'Plan',
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-03-01T00:00:00Z'),
      createdBy: 'u1',
    });
    expect(v.name).toBe('Plan');
    expect(prisma.timelineView.create).toHaveBeenCalledTimes(1);
  });

  it('createView rejects inverted window', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createView({
        baseId: 'b',
        tableId: 't',
        name: 'P',
        windowStart: new Date('2026-02-01T00:00:00Z'),
        windowEnd: new Date('2026-01-01T00:00:00Z'),
        createdBy: 'u',
      })
    ).rejects.toThrow();
  });

  it('addTask persists a task', async () => {
    const { svc, prisma } = buildSvc();
    const task = await svc.addTask({
      baseId: 'b',
      tableId: 't',
      recordId: 'rec_1',
      name: 'Design',
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-04T00:00:00Z'),
    });
    expect(task.progress).toBe(0);
    expect(prisma.timelineTask.create).toHaveBeenCalledTimes(1);
  });

  it('addTask rejects bad dates', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.addTask({
        baseId: 'b',
        tableId: 't',
        recordId: 'r',
        name: 'A',
        start: new Date('2026-01-05T00:00:00Z'),
        end: new Date('2026-01-01T00:00:00Z'),
      })
    ).rejects.toThrow();
  });

  it('addTask rejects unknown parent', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.addTask({
        baseId: 'b',
        tableId: 't',
        recordId: 'r',
        name: 'A',
        start: null,
        end: null,
        parentTaskId: 'ghost',
      })
    ).rejects.toThrow(/parent/);
  });

  it('addDependency rejects mismatched tables', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't1' } as never);
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't2' } as never);
    await expect(
      svc.addDependency({ taskId: 'a', predecessorId: 'b', type: 'FS' })
    ).rejects.toThrow(/same table/);
  });

  it('addDependency rolls back on cycle', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't' } as never);
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't' } as never);
    prisma.timelineDependency.findMany.mockResolvedValueOnce([
      { id: 'd1', taskId: 'a', predecessorId: 'b', type: 'FS', lagDays: 0 },
    ] as never);
    prisma.timelineTask.findMany.mockResolvedValueOnce([
      {
        id: 'a',
        baseId: 'b',
        tableId: 't',
        recordId: 'a',
        name: 'a',
        start: null,
        end: null,
        progress: 0,
        parentTaskId: null,
      },
      {
        id: 'b',
        baseId: 'b',
        tableId: 't',
        recordId: 'b',
        name: 'b',
        start: null,
        end: null,
        progress: 0,
        parentTaskId: null,
      },
    ] as never);
    await expect(
      svc.addDependency({ taskId: 'b', predecessorId: 'a', type: 'FS' })
    ).rejects.toThrow(/cycle/);
    expect(prisma.timelineDependency.create).not.toHaveBeenCalled();
  });

  it('addDependency persists when acyclic', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't' } as never);
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ tableId: 't' } as never);
    prisma.timelineDependency.findMany.mockResolvedValueOnce([]);
    prisma.timelineTask.findMany.mockResolvedValueOnce([] as never);
    const dep = await svc.addDependency({ taskId: 'b', predecessorId: 'a', type: 'FS' });
    expect(dep.type).toBe('FS');
    expect(prisma.timelineDependency.create).toHaveBeenCalledTimes(1);
  });

  it('removeTask cascades dependencies', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ id: 'a' } as never);
    await svc.removeTask('a');
    expect(prisma.timelineDependency.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ taskId: 'a' }, { predecessorId: 'a' }] },
    });
    expect(prisma.timelineTask.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
  });

  it('updateTaskProgress validates the range', async () => {
    const { svc } = buildSvc();
    await expect(svc.updateTaskProgress('a', 2)).rejects.toThrow();
    await expect(svc.updateTaskProgress('a', NaN)).rejects.toThrow();
  });

  it('updateTaskProgress patches the row', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineTask.findUnique.mockResolvedValueOnce({ id: 'a' } as never);
    const t = await svc.updateTaskProgress('a', 0.5);
    expect(t.progress).toBe(0.5);
    expect(prisma.timelineTask.update).toHaveBeenCalledTimes(1);
  });

  it('computeCriticalPathForView aggregates tasks', async () => {
    const { svc, prisma } = buildSvc();
    prisma.timelineView.findUnique.mockResolvedValueOnce({
      id: 'v',
      tableId: 't',
      windowStart: new Date('2026-01-01T00:00:00Z'),
    } as never);
    prisma.timelineTask.findMany
      .mockResolvedValueOnce([
        {
          id: 'a',
          baseId: 'b',
          tableId: 't',
          recordId: 'a',
          name: 'a',
          start: new Date('2026-01-01T00:00:00Z'),
          end: new Date('2026-01-04T00:00:00Z'),
          progress: 0,
          parentTaskId: null,
        },
      ] as never)
      .mockResolvedValueOnce([{ id: 'a' }] as never);
    prisma.timelineDependency.findMany.mockResolvedValueOnce([] as never);
    const r = await svc.computeCriticalPathForView('v');
    expect(r.criticalTaskIds).toContain('a');
  });
});
