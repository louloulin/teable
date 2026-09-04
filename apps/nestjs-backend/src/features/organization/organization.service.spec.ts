import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';
import { OrganizationService } from './organization.service';

const userDelegate = {
  findUnique: vi.fn(),
  count: vi.fn(),
};

const prismaMock = {
  user: userDelegate,
} as unknown as PrismaService;

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<OrganizationService>(OrganizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrganizationMe', () => {
    it('returns null when userId is empty', async () => {
      expect(await service.getOrganizationMe('')).toBeNull();
      expect(userDelegate.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the user has no organizationId', async () => {
      userDelegate.findUnique.mockResolvedValueOnce({
        organizationId: null,
        isAdmin: false,
      });
      expect(await service.getOrganizationMe('u-no-org')).toBeNull();
    });

    it('returns the mapped organization view for a tenant user', async () => {
      userDelegate.findUnique.mockResolvedValueOnce({
        organizationId: 'org-1',
        isAdmin: true,
      });
      const me = await service.getOrganizationMe('u-admin');
      expect(me).toEqual({ id: 'org-1', name: 'org-1', isAdmin: true });
      expect(userDelegate.findUnique).toHaveBeenCalledWith({
        where: { id: 'u-admin', deletedTime: null },
        select: { organizationId: true, isAdmin: true },
      });
    });

    it('treats missing isAdmin as false', async () => {
      userDelegate.findUnique.mockResolvedValueOnce({
        organizationId: 'org-2',
        isAdmin: null,
      });
      const me = await service.getOrganizationMe('u-member');
      expect(me).toEqual({ id: 'org-2', name: 'org-2', isAdmin: false });
    });
  });

  describe('getDepartmentUsers', () => {
    it('returns an empty list with the total count of non-deleted users', async () => {
      userDelegate.count.mockResolvedValueOnce(42);
      const vo = await service.getDepartmentUsers();
      expect(vo).toEqual({ users: [], total: 42 });
      expect(userDelegate.count).toHaveBeenCalledWith({
        where: { deletedTime: null },
      });
    });

    it('returns zero total when no users exist', async () => {
      userDelegate.count.mockResolvedValueOnce(0);
      const vo = await service.getDepartmentUsers();
      expect(vo.total).toBe(0);
      expect(vo.users).toEqual([]);
    });
  });

  describe('getDepartmentList', () => {
    it('returns an empty array (departments not modeled yet)', async () => {
      expect(await service.getDepartmentList()).toEqual([]);
    });
  });

  describe('multi-tenant isolation contract', () => {
    it('exposes the three read endpoints independently', () => {
      expect(typeof service.getOrganizationMe).toBe('function');
      expect(typeof service.getDepartmentUsers).toBe('function');
      expect(typeof service.getDepartmentList).toBe('function');
    });

    it('always excludes soft-deleted users from counts', async () => {
      userDelegate.count.mockResolvedValueOnce(7);
      await service.getDepartmentUsers();
      expect(userDelegate.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedTime: null }) }),
      );
    });
  });
});
