import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';

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
    listSpaces: ReturnType<typeof vi.fn>;
    listPublishedTemplates: ReturnType<typeof vi.fn>;
    getAiSettings: ReturnType<typeof vi.fn>;
    getQuotaDashboard: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      listUsers: vi.fn(),
      listSpaces: vi.fn(),
      listPublishedTemplates: vi.fn(),
      getAiSettings: vi.fn(),
      getQuotaDashboard: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [AdminOpenApiController],
      providers: [
        { provide: AdminOpenApiService, useValue: service },
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
});