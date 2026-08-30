import { vi } from 'vitest';
import { AutomationService } from './automation.service';
import type { IAutomationDetail } from './automation.types';

interface IMockStore {
  automation: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  automationTrigger: {
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  automationAction: {
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  automationRun: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): IMockStore => ({
  automation: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: new Date() })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
  automationTrigger: {
    createMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  automationAction: {
    createMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  automationRun: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

describe('AutomationService (Stage 13 MVP)', () => {
  let svc: AutomationService;
  let store: IMockStore;

  beforeEach(() => {
    store = buildPrisma();
    svc = new AutomationService(store as never);
  });

  it('persists automation + triggers + actions and returns detail', async () => {
    const detail: Partial<IAutomationDetail> = {
      id: 'auto_1',
      baseId: 'b1',
      name: 'Notify on create',
      enabled: true,
      createdBy: 'u1',
      createdTime: new Date(),
      triggers: [
        {
          id: 'trg_1',
          automationId: 'auto_1',
          type: 'record_created',
          tableId: 't1',
          config: {},
          createdTime: new Date(),
        },
      ],
      actions: [
        {
          id: 'act_1',
          automationId: 'auto_1',
          type: 'webhook',
          orderIndex: 0,
          config: { url: 'https://example.com' },
          createdTime: new Date(),
        },
      ],
    };
    store.automation.findFirst.mockResolvedValueOnce(detail);

    const result = await svc.create({
      baseId: 'b1',
      name: 'Notify on create',
      createdBy: 'u1',
      triggers: [{ type: 'record_created', tableId: 't1' }],
      actions: [{ type: 'webhook', config: { url: 'https://example.com' } }],
    });

    expect(result.id).toBe('auto_1');
    expect(store.automation.create).toHaveBeenCalledTimes(1);
    expect(store.automationTrigger.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'record_created', tableId: 't1' }),
        ]),
      })
    );
    expect(store.automationAction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ type: 'webhook', orderIndex: 0 })]),
      })
    );
  });

  it('trigger() records a pending run for an enabled automation', async () => {
    store.automation.findFirst.mockResolvedValueOnce({
      id: 'auto_1',
      enabled: true,
      triggers: [],
      actions: [],
    });
    const run = await svc.trigger('auto_1', {
      triggerType: 'record_created',
      payload: { row: { id: 'r1' } },
    });
    expect(run.status).toBe('pending');
    expect(store.automationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationId: 'auto_1',
          triggerType: 'record_created',
          status: 'pending',
        }),
      })
    );
  });

  it('trigger() records a skipped run for a disabled automation', async () => {
    store.automation.findFirst.mockResolvedValueOnce({
      id: 'auto_1',
      enabled: false,
      triggers: [],
      actions: [],
    });
    const run = await svc.trigger('auto_1', {
      triggerType: 'schedule',
      payload: {},
    });
    expect(run.status).toBe('skipped');
    expect(run.error).toBe('automation disabled');
  });

  it('trigger() records a failed run when the automation id is unknown', async () => {
    store.automation.findFirst.mockResolvedValueOnce(null);
    const run = await svc.trigger('auto_does_not_exist', {
      triggerType: 'record_updated',
      payload: {},
    });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/not found/);
  });

  it('finishRun() sets status, output, finishedAt', async () => {
    await svc.finishRun('run_1', {
      status: 'succeeded',
      output: { delivered: true },
    });
    expect(store.automationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: expect.objectContaining({
          status: 'succeeded',
          output: { delivered: true },
          finishedAt: expect.any(Date),
        }),
      })
    );
  });

  it('sets startedAt without finishing a run when status is running', async () => {
    await svc.finishRun('run_running', { status: 'running' });
    expect(store.automationRun.update).toHaveBeenCalledWith({
      where: { id: 'run_running' },
      data: expect.objectContaining({
        status: 'running',
        startedAt: expect.any(Date),
        finishedAt: null,
      }),
    });
  });

  it('listByBase() passes baseId where and createdTime desc ordering', async () => {
    store.automation.findMany.mockResolvedValueOnce([]);
    await svc.listByBase('b1');
    expect(store.automation.findMany).toHaveBeenCalledWith({
      where: { baseId: 'b1' },
      orderBy: { createdTime: 'desc' },
    });
  });

  it('saves updates as a draft without replacing live actions', async () => {
    const live = {
      id: 'auto_1',
      name: 'Live',
      enabled: true,
      draftVersion: 0,
      liveVersion: 1,
      triggers: [{ type: 'record_created' }],
      actions: [{ type: 'email', orderIndex: 0, config: {} }],
    };
    store.automation.findFirst.mockResolvedValueOnce(live).mockResolvedValueOnce({
      ...live,
      draftConfig: { name: 'Draft', triggers: [], actions: [] },
      draftVersion: 1,
    });

    const result = await svc.update('auto_1', {
      name: 'Draft',
      lastModifiedBy: 'u1',
      triggers: [],
      actions: [],
    });

    expect(result.draftVersion).toBe(1);
    expect(store.automationTrigger.deleteMany).not.toHaveBeenCalled();
    expect(store.automationAction.deleteMany).not.toHaveBeenCalled();
    expect(store.automation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ draftConfig: expect.any(Object), draftVersion: 1 }),
      })
    );
  });

  it('applies a draft and links a retry to its source run', async () => {
    const live = {
      id: 'auto_1',
      name: 'Live',
      enabled: true,
      liveVersion: 1,
      draftConfig: { triggers: [], actions: [] },
      triggers: [],
      actions: [{ type: 'run_script', orderIndex: 0, config: { script: 'return 1' } }],
    };
    store.automation.findFirst.mockResolvedValueOnce(live).mockResolvedValueOnce(live);
    await svc.applyUpdate('auto_1', 'u1');
    expect(store.automationTrigger.deleteMany).toHaveBeenCalledWith({
      where: { automationId: 'auto_1' },
    });
    expect(store.automationAction.deleteMany).toHaveBeenCalledWith({
      where: { automationId: 'auto_1' },
    });

    store.automationRun.findFirst.mockResolvedValueOnce({
      id: 'run_1',
      automationId: 'auto_1',
      triggerType: 'record_created',
      status: 'failed',
      input: {},
      output: {
        steps: [
          { index: 0, status: 'succeeded' },
          { index: 1, status: 'failed' },
        ],
      },
      error: 'failed',
      retryCount: 0,
      version: 1,
    });
    store.automation.findFirst.mockResolvedValueOnce({ ...live, draftConfig: null });
    store.automationRun.create.mockResolvedValueOnce({ id: 'run_2', status: 'pending' });
    const retry = await svc.createRetryRun('run_1', 'resume');
    expect(retry.resumeFromStep).toBe(1);
    expect(store.automationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentRunId: 'run_1', resumeFromStep: 1 }),
      })
    );
  });
});
