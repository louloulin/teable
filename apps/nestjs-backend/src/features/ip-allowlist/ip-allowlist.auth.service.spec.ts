import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

import { IpAllowlistAuthService } from './ip-allowlist.auth.service';

interface MockOrgIpAllowlist {
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface MockPrisma {
  organizationIpAllowlist: MockOrgIpAllowlist;
}

const buildPrisma = (): MockPrisma => ({
  organizationIpAllowlist: {
    create: vi.fn(async ({ data }) => data),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => []),
  },
});

describe('IpAllowlistAuthService (Stage 25)', () => {
  let prisma: MockPrisma;
  let svc: IpAllowlistAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new IpAllowlistAuthService(prisma as never);
  });

  describe('add', () => {
    it('persists a valid CIDR entry with default block mode', async () => {
      const out = await svc.add({
        organizationId: 'org_1',
        cidr: '10.0.0.0/8',
        createdBy: 'u1',
      });
      expect(out.cidr).toBe('10.0.0.0/8');
      expect(out.mode).toBe('block');
      expect(prisma.organizationIpAllowlist.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed CIDR with a friendly error', async () => {
      await expect(
        svc.add({ organizationId: 'org_1', cidr: 'not-a-cidr', createdBy: 'u1' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts audit mode', async () => {
      const out = await svc.add({
        organizationId: 'org_1',
        cidr: '192.168.0.0/16',
        mode: 'audit',
        createdBy: 'u1',
      });
      expect(out.mode).toBe('audit');
    });
  });

  describe('remove', () => {
    it('returns true when a row was deleted', async () => {
      prisma.organizationIpAllowlist.deleteMany.mockResolvedValueOnce({ count: 1 });
      expect(await svc.remove({ organizationId: 'org_1', id: 'e1' })).toBe(true);
    });

    it('returns false when no row matched', async () => {
      prisma.organizationIpAllowlist.deleteMany.mockResolvedValueOnce({ count: 0 });
      expect(await svc.remove({ organizationId: 'org_1', id: 'missing' })).toBe(false);
    });
  });

  describe('list', () => {
    it('coerces stored mode into the IpAllowlistMode union', async () => {
      prisma.organizationIpAllowlist.findMany.mockResolvedValueOnce([
        {
          id: 'e1',
          organizationId: 'org_1',
          cidr: '10.0.0.0/8',
          mode: 'block',
          note: null,
        },
        {
          id: 'e2',
          organizationId: 'org_1',
          cidr: '192.168.0.0/16',
          mode: 'audit',
          note: 'office',
        },
      ]);
      const out = await svc.list('org_1');
      expect(out).toHaveLength(2);
      expect(out[0].mode).toBe('block');
      expect(out[1].mode).toBe('audit');
      expect(out[1].note).toBe('office');
    });
  });

  describe('evaluate', () => {
    it('returns allowed=true when the org has no entries', async () => {
      const r = await svc.evaluate({
        organizationId: 'org_1',
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });
      expect(r.decision.allowed).toBe(true);
      expect(r.decision.blocked).toBe(false);
    });

    it('blocks when the IP matches a block-mode entry', async () => {
      prisma.organizationIpAllowlist.findMany.mockResolvedValueOnce([
        {
          id: 'e1',
          organizationId: 'org_1',
          cidr: '10.0.0.0/8',
          mode: 'block',
          note: null,
        },
      ]);
      const r = await svc.evaluate({
        organizationId: 'org_1',
        headers: { 'x-forwarded-for': '10.5.0.1' },
      });
      expect(r.decision.blocked).toBe(true);
      expect(r.decision.matchedEntryId).toBe('e1');
    });

    it('does NOT block when the header is missing (fail open)', async () => {
      const r = await svc.evaluate({
        organizationId: 'org_1',
        headers: {},
      });
      expect(r.decision.allowed).toBe(true);
      expect(r.ip).toBeNull();
    });

    it('uses remoteAddress when no XFF header is present', async () => {
      const r = await svc.evaluate({
        organizationId: 'org_1',
        headers: {},
        remoteAddress: '203.0.113.5',
      });
      expect(r.ip).toBe('203.0.113.5');
      expect(r.decision.allowed).toBe(true);
    });
  });

  describe('validateCidr', () => {
    it('passes through a well-formed CIDR', () => {
      expect(() => svc.validateCidr('10.0.0.0/8')).not.toThrow();
    });
    it('throws BadRequestException on garbage', () => {
      expect(() => svc.validateCidr('not-a-cidr')).toThrow(BadRequestException);
    });
  });
});
