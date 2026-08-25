import { AutomationService } from './automation.service';
import { IAutomationDetail } from './automation.types';
import { vi } from 'vitest';

interface MockStore {
  automation: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  automationTrigger: { createMany: ReturnType<typeof vi.fn> };
  automationAction: { createMany: ReturnType<typeof vi.fn> };
  automationRun: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  automation: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: new Date() })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
  },
  automationTrigger: { createMany: vi.fn(async () => ({ count: 0 })) },
  automationAction: { createMany: vi.fn(async () => ({ count: 0 })) },
  automationRun: {
    create: vi.fn(async ({ data }) => data),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
  },
});

describe('AutomationService (Stage 13 MVP)', () => {
  let svc: AutomationService;
  let store: MockStore;

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
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'webhook', orderIndex: 0 }),
        ]),
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

  it('listByBase() passes baseId where and createdTime desc ordering', async () => {
    store.automation.findMany.mockResolvedValueOnce([]);
    await svc.listByBase('b1');
    expect(store.automation.findMany).toHaveBeenCalledWith({
      where: { baseId: 'b1' },
      orderBy: { createdTime: 'desc' },
    });
  });
});
