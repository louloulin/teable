/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { DataResidencyAuthService } from './data-residency.auth.service';

interface IMockRegionTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPolicyTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  region: IMockRegionTable;
  dataResidencyPolicy: IMockPolicyTable;
}

const buildPrisma = (): IMockPrisma => ({
  region: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      ...data,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    update: vi.fn(async ({ where, data }) => ({ code: where.code, ...data })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  dataResidencyPolicy: {
    create: vi.fn(async ({ data }) => ({ id: data.id, ...data, updatedTime: new Date() })),
    update: vi.fn(async ({ where, data }) => ({
      organizationId: where.organizationId,
      ...data,
      updatedTime: new Date(),
    })),
    delete: vi.fn(async () => undefined),
    findUnique: vi.fn(async () => null),
  },
});

describe('DataResidencyAuthService (Stage 34)', () => {
  let prisma: IMockPrisma;
  let svc: DataResidencyAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new DataResidencyAuthService(prisma as never);
  });

  describe('createRegion', () => {
    it('creates a region', async () => {
      const out = await svc.createRegion({ code: 'eu', displayName: 'EU' });
      expect(out.code).toBe('eu');
      expect(out.status).toBe('active');
    });

    it('rejects bad code', async () => {
      await expect(svc.createRegion({ code: 'EU', displayName: 'EU' })).rejects.toBeInstanceOf(
        BadRequestException
      );
      await expect(svc.createRegion({ code: 'eur', displayName: 'EU' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('rejects duplicate', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({ id: 'reg_x', code: 'eu' });
      await expect(svc.createRegion({ code: 'eu', displayName: 'EU' })).rejects.toBeInstanceOf(
        ConflictException
      );
    });
  });

  describe('updateRegionStatus', () => {
    it('updates when valid', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'eu',
        displayName: 'EU',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      prisma.region.update.mockResolvedValueOnce({
        id: 'r',
        code: 'eu',
        displayName: 'EU',
        status: 'draining',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.updateRegionStatus('eu', 'draining');
      expect(out.status).toBe('draining');
    });

    it('rejects invalid transition', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'eu',
        displayName: 'EU',
        status: 'offline',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await expect(svc.updateRegionStatus('eu', 'draining')).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('rejects unknown region', async () => {
      await expect(svc.updateRegionStatus('xx', 'active')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('setPolicy', () => {
    it('creates a new policy', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'eu',
        displayName: 'EU',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.setPolicy({
        organizationId: 'o1',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
      });
      expect(out.locked).toBe(true);
    });

    it('throws when region does not exist', async () => {
      await expect(
        svc.setPolicy({ organizationId: 'o1', regionCode: 'eu', locked: false, updatedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects offline region', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'eu',
        displayName: 'EU',
        status: 'offline',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await expect(
        svc.setPolicy({ organizationId: 'o1', regionCode: 'eu', locked: false, updatedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates existing policy when not locked to a different region', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'us',
        displayName: 'US',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: false,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      const out = await svc.setPolicy({
        organizationId: 'o1',
        regionCode: 'us',
        locked: false,
        updatedBy: 'u',
      });
      expect(out.regionCode).toBe('us');
    });

    it('rejects changing a locked policy', async () => {
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'us',
        displayName: 'US',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      await expect(
        svc.setPolicy({ organizationId: 'o1', regionCode: 'us', locked: true, updatedBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deletePolicy', () => {
    it('deletes an unlocked policy', async () => {
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: false,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      const ok = await svc.deletePolicy('o1');
      expect(ok).toBe(true);
    });

    it('returns false when missing', async () => {
      expect(await svc.deletePolicy('missing')).toBe(false);
    });

    it('rejects when locked', async () => {
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      await expect(svc.deletePolicy('o1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('authorizeRequest', () => {
    it('denies when no policy', async () => {
      const r = await svc.authorizeRequest({
        organizationId: 'o1',
        headers: { 'x-teable-region': 'eu' },
      });
      expect(r.reason).toBe('no-policy');
    });

    it('allows same-region', async () => {
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      const r = await svc.authorizeRequest({
        organizationId: 'o1',
        headers: { 'x-teable-region': 'eu' },
      });
      expect(r.reason).toBe('same-region');
    });

    it('denies locked cross-region', async () => {
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'us',
        displayName: 'US',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const r = await svc.authorizeRequest({
        organizationId: 'o1',
        headers: { 'x-teable-region': 'us' },
      });
      expect(r.reason).toBe('policy-locked');
    });

    it('allows unlocked cross-region', async () => {
      prisma.dataResidencyPolicy.findUnique.mockResolvedValueOnce({
        id: 'p',
        organizationId: 'o1',
        regionCode: 'eu',
        locked: false,
        updatedBy: 'u',
        updatedTime: new Date(),
      });
      prisma.region.findUnique.mockResolvedValueOnce({
        id: 'r',
        code: 'us',
        displayName: 'US',
        status: 'active',
        dataCenterLocation: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const r = await svc.authorizeRequest({
        organizationId: 'o1',
        headers: { 'x-teable-region': 'us' },
      });
      expect(r.reason).toBe('target-active');
    });
  });
});
