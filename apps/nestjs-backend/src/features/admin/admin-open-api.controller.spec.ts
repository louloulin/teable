import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { vi } from 'vitest';
import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';
import { AdminTableQueryOpsService } from './admin-table-query-ops.service';

/**
 * Controller-level tests focus on the wiring: every route should pass
 * validated query params to the service, and search/pagination should
 * round-trip unchanged. The license gate behavior is covered in
 * `license-capability.service.spec.ts` and the guard's `canActivate`
 * already delegates to that single source of truth.
 */
describe('AdminOpenApiController', () => {
  let controller: AdminOpenApiController;
  let service: {
    listUsers: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    createPasswordReset: ReturnType<typeof vi.fn>;
    listSpaces: ReturnType<typeof vi.fn>;
    listPublishedTemplates: ReturnType<typeof vi.fn>;
    getAiSettings: ReturnType<typeof vi.fn>;
    getQuotaDashboard: ReturnType<typeof vi.fn>;
    getTableQueryOpsOverview: ReturnType<typeof vi.fn>;
    getAiGenerationQueueOverview: ReturnType<typeof vi.fn>;
    listAiGenerationTasks: ReturnType<typeof vi.fn>;
    cancelAiGenerationTask: ReturnType<typeof vi.fn>;
    restoreUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
    permanentlyDeleteUser: ReturnType<typeof vi.fn>;
  };
  let tableQueryOpsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      listUsers: vi.fn(),
      updateUser: vi.fn(),
      createPasswordReset: vi.fn(),
      listSpaces: vi.fn(),
      listPublishedTemplates: vi.fn(),
      getAiSettings: vi.fn(),
      getQuotaDashboard: vi.fn(),
      getTableQueryOpsOverview: vi.fn(),
      getAiGenerationQueueOverview: vi.fn(),
      listAiGenerationTasks: vi.fn(),
      cancelAiGenerationTask: vi.fn(),
      restoreUser: vi.fn(),
      deleteUser: vi.fn(),
      permanentlyDeleteUser: vi.fn(),
    };
    tableQueryOpsService = {
      acceptRecommendation: vi.fn(),
      dismissRecommendation: vi.fn(),
      runTask: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [AdminOpenApiController],
      providers: [
        { provide: AdminOpenApiService, useValue: service },
        { provide: AdminTableQueryOpsService, useValue: tableQueryOpsService },
        { provide: ClsService, useValue: { get: vi.fn(() => 'admin-1') } },
      ],
    }).compile();

    controller = module.get(AdminOpenApiController);
  });

  it('returns the service result for /api/admin/users (empty case)', async () => {
    const empty = { list: [], total: 0, skip: 0, take: 100 };
    service.listUsers.mockResolvedValue(empty);
    const out = await controller.listUsers({ skip: 0, take: 100 });
    expect(service.listUsers).toHaveBeenCalledWith({ skip: 0, take: 100 });
    expect(out).toEqual(empty);
  });

  it('forwards skip / take / search to /api/admin/users', async () => {
    service.listUsers.mockResolvedValue({ list: [], total: 0, skip: 10, take: 5 });
    await controller.listUsers({ skip: 10, take: 5, search: 'alice' });
    expect(service.listUsers).toHaveBeenCalledWith({
      skip: 10,
      take: 5,
      search: 'alice',
    });
  });

  it('forwards an authenticated admin user update', async () => {
    const updated = { id: 'user-2', isAdmin: false, deactivatedTime: null };
    service.updateUser.mockResolvedValue(updated);
    const out = await controller.updateUser({ id: 'user-2' }, { active: true });
    expect(out).toEqual(updated);
    expect(service.updateUser).toHaveBeenCalledWith({
      userId: 'user-2',
      requesterId: 'admin-1',
      active: true,
    });
  });

  it('forwards skip / take to /api/admin/spaces', async () => {
    service.listSpaces.mockResolvedValue({ list: [], total: 0, skip: 20, take: 50 });
    await controller.listSpaces({ skip: 20, take: 50 });
    expect(service.listSpaces).toHaveBeenCalledWith({ skip: 20, take: 50 });
  });

  it('forwards skip / take to /api/admin/templates', async () => {
    service.listPublishedTemplates.mockResolvedValue({
      list: [],
      total: 0,
      skip: 0,
      take: 100,
    });
    await controller.listTemplates({ skip: 0, take: 100 });
    expect(service.listPublishedTemplates).toHaveBeenCalledWith({ skip: 0, take: 100 });
  });

  it('forwards skip / take to /api/admin/quota-dashboard', async () => {
    service.getQuotaDashboard.mockResolvedValue({
      list: [],
      total: 0,
      skip: 0,
      take: 50,
    });
    await controller.quotaDashboard({ skip: 0, take: 50 });
    expect(service.getQuotaDashboard).toHaveBeenCalledWith({ skip: 0, take: 50 });
  });

  it('returns the service result for /api/admin/ai-settings', async () => {
    service.getAiSettings.mockResolvedValue({ aiConfig: { foo: 'bar' } });
    const out = await controller.aiSettings();
    expect(out).toEqual({ aiConfig: { foo: 'bar' } });
    expect(service.getAiSettings).toHaveBeenCalledTimes(1);
  });

  it('forwards the Table Query Ops scope and limit', async () => {
    const result = { enabled: true, summary: {}, hotTables: [], recommendations: [], tasks: [] };
    service.getTableQueryOpsOverview.mockResolvedValue(result);
    await expect(
      controller.tableQueryOpsOverview({ baseId: 'base-1', limit: 10 })
    ).resolves.toEqual(result);
    expect(service.getTableQueryOpsOverview).toHaveBeenCalledWith({ baseId: 'base-1', limit: 10 });
  });

  it('returns the AI generation diagnostics overview', async () => {
    const result = { queue: { available: false }, summary: {}, fields: [], recentRuns: [] };
    service.getAiGenerationQueueOverview.mockResolvedValue(result);
    await expect(controller.aiGenerationQueueOverview()).resolves.toEqual(result);
    expect(service.getAiGenerationQueueOverview).toHaveBeenCalledTimes(1);
  });

  it('lists and cancels AI generation tasks', async () => {
    service.listAiGenerationTasks.mockResolvedValue([{ id: 'task-1' }]);
    service.cancelAiGenerationTask.mockResolvedValue({ id: 'task-1', cancelRequested: true });

    await expect(
      controller.aiGenerationQueueTasks({ status: 'processing', take: 25 })
    ).resolves.toEqual([{ id: 'task-1' }]);
    await expect(controller.cancelAiGenerationQueueTask({ id: 'task-1' })).resolves.toEqual({
      id: 'task-1',
      cancelRequested: true,
    });
    expect(service.listAiGenerationTasks).toHaveBeenCalledWith({ status: 'processing', take: 25 });
    expect(service.cancelAiGenerationTask).toHaveBeenCalledWith('task-1');
  });
});
