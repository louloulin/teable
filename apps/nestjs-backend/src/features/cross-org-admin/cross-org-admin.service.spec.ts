import { describe, expect, it, vi } from 'vitest';
import { CrossOrgAdminService } from './cross-org-admin.service';

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'coag_1',
  userId: 'user_1',
  spaceId: 'space_1',
  grantedBy: 'admin_1',
  role: 'admin',
  reason: null,
  expiresAt: null,
  revokedAt: null,
  createdTime: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const buildPrisma = () => ({
  crossOrgAdminGrant: {
    findMany: vi.fn().mockResolvedValue([row()]),
    create: vi.fn().mockResolvedValue(row({ id: 'coag_2' })),
    findUnique: vi.fn().mockResolvedValue(row()),
    update: vi.fn().mockResolvedValue(row({ revokedAt: new Date() })),
  },
});

describe('CrossOrgAdminService', () => {
  it('reads real grants from Prisma and maps space compatibility alias', async () => {
    const prisma = buildPrisma();
    const grants = await new CrossOrgAdminService(prisma as never).listGrants({ orgId: 'space_1' });
    expect(prisma.crossOrgAdminGrant.findMany).toHaveBeenCalledWith({
      where: { userId: undefined, spaceId: 'space_1' },
      orderBy: { createdTime: 'desc' },
    });
    expect(grants[0]).toMatchObject({ spaceId: 'space_1', orgId: 'space_1' });
  });

  it('persists grants with the actual schema fields', async () => {
    const prisma = buildPrisma();
    await new CrossOrgAdminService(prisma as never).grant({
      userId: 'user_1', spaceId: 'space_1', grantedBy: 'admin_1', role: 'owner', reason: 'support',
    });
    expect(prisma.crossOrgAdminGrant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user_1', spaceId: 'space_1', role: 'owner', reason: 'support' }),
    }));
  });

  it('soft-revokes a persisted grant', async () => {
    const prisma = buildPrisma();
    const service = new CrossOrgAdminService(prisma as never);
    expect(await service.revoke('coag_1')).toBe(true);
    expect(prisma.crossOrgAdminGrant.update).toHaveBeenCalledWith({
      where: { id: 'coag_1' }, data: { revokedAt: expect.any(Date) },
    });
  });
});
