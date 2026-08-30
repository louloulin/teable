/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DataMaskingAuthService } from './data-masking.auth.service';
import type { IMaskingPolicy } from './data-masking.types';

interface IMockPolicyRow {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  strategy: string;
  scope: string;
  allowedRolesJson: string;
  partialJson: string | null;
  regexRulesJson: string | null;
  label: string | null;
  createdTime: Date;
  updatedTime: Date;
}

interface IMockMaskedRow {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  fieldId: string;
  policyId: string;
  viewerUserId: string;
  createdTime: Date;
}

function mkPolicyRow(over: Partial<IMockPolicyRow> = {}): IMockPolicyRow {
  return {
    id: 'mp_1',
    baseId: 'b1',
    tableId: 't1',
    fieldId: 'f1',
    strategy: 'full-redact',
    scope: 'all',
    allowedRolesJson: '[]',
    partialJson: null,
    regexRulesJson: null,
    label: null,
    createdTime: new Date('2024-01-01T00:00:00Z'),
    updatedTime: new Date('2024-01-01T00:00:00Z'),
    ...over,
  };
}

function mkMaskedRow(over: Partial<IMockMaskedRow> = {}): IMockMaskedRow {
  return {
    id: 'mf_1',
    baseId: 'b1',
    tableId: 't1',
    recordId: 'r1',
    fieldId: 'f1',
    policyId: 'mp_1',
    viewerUserId: 'u1',
    createdTime: new Date('2024-01-01T00:00:00Z'),
    ...over,
  };
}

function mkPrismaMock() {
  const policyCreate = vi.fn();
  const policyFindMany = vi.fn();
  const policyFindUnique = vi.fn();
  const policyUpdate = vi.fn();
  const policyDelete = vi.fn();
  const maskedCreate = vi.fn();
  const maskedFindMany = vi.fn();

  const prisma = {
    maskingPolicy: {
      create: policyCreate,
      findMany: policyFindMany,
      findUnique: policyFindUnique,
      update: policyUpdate,
      delete: policyDelete,
    },
    maskedFieldRow: {
      create: maskedCreate,
      findMany: maskedFindMany,
    },
  } as unknown as PrismaService;

  return {
    prisma,
    mocks: {
      policyCreate,
      policyFindMany,
      policyFindUnique,
      policyUpdate,
      policyDelete,
      maskedCreate,
      maskedFindMany,
    },
  };
}

describe('DataMaskingAuthService', () => {
  describe('createPolicy', () => {
    it('persists a valid policy and returns the parsed shape', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyCreate.mockResolvedValue(mkPolicyRow({ id: 'mp_new', strategy: 'phone-tail' }));
      const svc = new DataMaskingAuthService(prisma);

      const out = await svc.createPolicy({
        baseId: 'b1',
        tableId: 't1',
        fieldId: 'phone',
        strategy: 'phone-tail',
        scope: 'all',
      });

      expect(out.id).toBe('mp_new');
      expect(out.strategy).toBe('phone-tail');
      expect(mocks.policyCreate).toHaveBeenCalledOnce();
    });

    it('throws on invalid strategy', async () => {
      const { prisma, mocks } = mkPrismaMock();
      const svc = new DataMaskingAuthService(prisma);
      await expect(
        svc.createPolicy({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'wat',
          scope: 'all',
        } as never)
      ).rejects.toThrow(/strategy/);
      expect(mocks.policyCreate).not.toHaveBeenCalled();
    });

    it('serializes allowedRoles/partial/regexRules as JSON', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyCreate.mockResolvedValue(mkPolicyRow());
      const svc = new DataMaskingAuthService(prisma);

      await svc.createPolicy({
        baseId: 'b1',
        tableId: 't1',
        fieldId: 'f1',
        strategy: 'partial',
        scope: 'role-based',
        allowedRoles: ['owner', 'editor'],
        partial: { keepPrefix: 1, keepSuffix: 1, mask: '*' },
        label: 'greeting',
      });

      const call = mocks.policyCreate.mock.calls[0][0];
      expect(call.data.allowedRolesJson).toBe('["owner","editor"]');
      expect(call.data.partialJson).toBe('{"keepPrefix":1,"keepSuffix":1,"mask":"*"}');
      expect(call.data.regexRulesJson).toBeNull();
      expect(call.data.label).toBe('greeting');
    });
  });

  describe('listPolicies', () => {
    it('scopes by baseId (and optional tableId)', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindMany.mockResolvedValue([mkPolicyRow(), mkPolicyRow({ id: 'mp_2' })]);
      const svc = new DataMaskingAuthService(prisma);

      await svc.listPolicies('b1');
      expect(mocks.policyFindMany).toHaveBeenCalledWith({ where: { baseId: 'b1' } });

      await svc.listPolicies('b1', 't1');
      expect(mocks.policyFindMany).toHaveBeenLastCalledWith({
        where: { baseId: 'b1', tableId: 't1' },
      });
    });

    it('maps rows to policy objects', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindMany.mockResolvedValue([
        mkPolicyRow({ id: 'mp_a', strategy: 'hash' }),
        mkPolicyRow({
          id: 'mp_b',
          strategy: 'partial',
          partialJson: '{"keepPrefix":1,"keepSuffix":2,"mask":"#"}',
        }),
      ]);
      const svc = new DataMaskingAuthService(prisma);

      const out = await svc.listPolicies('b1');
      expect(out[0].strategy).toBe('hash');
      expect(out[1].partial).toEqual({ keepPrefix: 1, keepSuffix: 2, mask: '#' });
    });
  });

  describe('getPolicy', () => {
    it('returns the parsed policy', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(mkPolicyRow({ id: 'mp_x' }));
      const svc = new DataMaskingAuthService(prisma);

      const out = await svc.getPolicy('mp_x');
      expect(out.id).toBe('mp_x');
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(null);
      const svc = new DataMaskingAuthService(prisma);
      await expect(svc.getPolicy('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updatePolicy', () => {
    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(null);
      const svc = new DataMaskingAuthService(prisma);
      await expect(svc.updatePolicy('nope', { label: 'x' })).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(mocks.policyUpdate).not.toHaveBeenCalled();
    });

    it('rejects invalid scope', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(mkPolicyRow());
      const svc = new DataMaskingAuthService(prisma);
      await expect(svc.updatePolicy('mp_1', { scope: 'random' as never })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('rejects invalid role in allowedRoles', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(mkPolicyRow());
      const svc = new DataMaskingAuthService(prisma);
      await expect(
        svc.updatePolicy('mp_1', { allowedRoles: ['owner', 'wat'] as never })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates and returns the new policy', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(mkPolicyRow());
      mocks.policyUpdate.mockResolvedValue(
        mkPolicyRow({ id: 'mp_1', scope: 'role-based', allowedRolesJson: '["owner"]' })
      );
      const svc = new DataMaskingAuthService(prisma);

      const out = await svc.updatePolicy('mp_1', {
        scope: 'role-based',
        allowedRoles: ['owner'],
      });
      expect(out.scope).toBe('role-based');
      expect(out.allowedRoles).toEqual(['owner']);
    });
  });

  describe('deletePolicy', () => {
    it('deletes when present', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(mkPolicyRow());
      const svc = new DataMaskingAuthService(prisma);
      await svc.deletePolicy('mp_1');
      expect(mocks.policyDelete).toHaveBeenCalledWith({ where: { id: 'mp_1' } });
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.policyFindUnique.mockResolvedValue(null);
      const svc = new DataMaskingAuthService(prisma);
      await expect(svc.deletePolicy('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.policyDelete).not.toHaveBeenCalled();
    });
  });

  describe('recordMasking + listMaskingHistory', () => {
    it('persists and queries back by baseId', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.maskedCreate.mockResolvedValue(mkMaskedRow());
      mocks.maskedFindMany.mockResolvedValue([mkMaskedRow()]);
      const svc = new DataMaskingAuthService(prisma);

      await svc.recordMasking({
        baseId: 'b1',
        tableId: 't1',
        recordId: 'r1',
        fieldId: 'f1',
        policyId: 'mp_1',
        viewerUserId: 'u1',
      });
      expect(mocks.maskedCreate).toHaveBeenCalledOnce();

      await svc.listMaskingHistory({ baseId: 'b1' });
      expect(mocks.maskedFindMany).toHaveBeenCalledWith({
        where: { baseId: 'b1' },
        orderBy: { createdTime: 'desc' },
        take: 100,
      });

      await svc.listMaskingHistory({ baseId: 'b1', recordId: 'r1', limit: 5 });
      expect(mocks.maskedFindMany).toHaveBeenLastCalledWith({
        where: { baseId: 'b1', recordId: 'r1' },
        orderBy: { createdTime: 'desc' },
        take: 5,
      });
    });
  });

  describe('maskValueForViewer / maskRecordForViewer', () => {
    it('delegates to pure helpers', () => {
      const { prisma } = mkPrismaMock();
      const svc = new DataMaskingAuthService(prisma);
      const out = svc.maskValueForViewer(
        {
          id: 'mp_1',
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'phone-tail',
          scope: 'all',
          allowedRoles: [],
          createdTime: new Date(),
          updatedTime: new Date(),
        },
        '555-123-4567',
        'viewer'
      );
      expect(out.masked).toBe(true);
      expect(out.value).toBe('***-***-4567');
    });
  });

  describe('exposed helpers', () => {
    it('exposes isValidStrategy/isValidRole/viewerMaySee', () => {
      const { prisma } = mkPrismaMock();
      const svc = new DataMaskingAuthService(prisma);
      expect(svc.isValidStrategy('hash')).toBe(true);
      expect(svc.isValidStrategy('wat')).toBe(false);
      expect(svc.isValidRole('owner')).toBe(true);
      const p: IMaskingPolicy = {
        id: 'mp_1',
        baseId: 'b1',
        tableId: 't1',
        fieldId: 'f1',
        strategy: 'hash',
        scope: 'role-based',
        allowedRoles: ['owner'],
        createdTime: new Date(),
        updatedTime: new Date(),
      };
      expect(svc.viewerMaySee(p, 'owner')).toBe(true);
      expect(svc.viewerMaySee(p, 'viewer')).toBe(false);
    });
  });
});
